<?php
// export_safe.php
// Safe SQL exporter — now with table selection and row counts.
// Compatible with older PHP versions.

session_start();

// ---------- CONFIG ----------
$defaultHost = '127.0.0.1';
$defaultUser = 'root';
$defaultPass = '';   // set if needed
$defaultPort = 3306;
$defaultLimit = 100;     // default rows per table when exporting data

// ---------- Helpers ----------
function connect_mysqli($host, $user, $pass, $port) {
    $mysqli = @new mysqli($host, $user, $pass, '', $port);
    if ($mysqli->connect_errno) {
        throw new Exception("MySQL connect error: " . $mysqli->connect_error);
    }
    $mysqli->set_charset('utf8mb4');
    return $mysqli;
}

function escape_identifier($s) {
    return "`" . str_replace("`", "``", $s) . "`";
}

function value_to_sql($val, $mysqli) {
    if (is_null($val)) return "NULL";
    return "'" . $mysqli->real_escape_string((string)$val) . "'";
}

function get_databases($mysqli) {
    $dbs = array();
    $res = $mysqli->query("SHOW DATABASES");
    if ($res) {
        while ($row = $res->fetch_row()) $dbs[] = $row[0];
        $res->free();
    }
    return $dbs;
}

function get_tables_with_counts($mysqli, $db) {
    $tables = array();
    $mysqli->select_db($db);
    $res = $mysqli->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    if ($res) {
        while ($row = $res->fetch_row()) {
            $tbl = $row[0];
            $count = null;
            // attempt to get count — wrap in try/catch style by checking result
            $cres = $mysqli->query("SELECT COUNT(*) AS cnt FROM " . escape_identifier($tbl));
            if ($cres) {
                $crow = $cres->fetch_assoc();
                $count = isset($crow['cnt']) ? intval($crow['cnt']) : null;
                $cres->free();
            }
            $tables[] = array('name' => $tbl, 'count' => $count);
        }
        $res->free();
    }
    return $tables;
}

function get_create_table($mysqli, $table) {
    $res = $mysqli->query("SHOW CREATE TABLE " . escape_identifier($table));
    if ($res) {
        $row = $res->fetch_assoc();
        $res->free();
        if ($row) {
            foreach ($row as $col => $val) {
                if (stripos($col, 'create') !== false) return $val;
            }
        }
    }
    return null;
}

function fetch_rows($mysqli, $table, $limit) {
    $rows = array();
    $q = "SELECT * FROM " . escape_identifier($table) . " LIMIT " . intval($limit);
    $res = $mysqli->query($q);
    if ($res) {
        while ($r = $res->fetch_assoc()) $rows[] = $r;
        $res->free();
    }
    return $rows;
}

// ---------- Main flow ----------
$errors = array();
$detectedDatabases = array();
$loadedTables = array(); // array of arrays: ['name'=>..., 'count'=>...]
$inputHost = $defaultHost;
$inputPort = $defaultPort;
$inputUser = $defaultUser;
$inputPass = $defaultPass;
$inputDb = '';
$inputMode = 'schema_and_data';
$inputLimit = $defaultLimit;

// Load saved values if present (preserve form between requests)
if (isset($_POST['db_host'])) $inputHost = $_POST['db_host'];
if (isset($_POST['db_port'])) $inputPort = intval($_POST['db_port']);
if (isset($_POST['db_user'])) $inputUser = $_POST['db_user'];
if (isset($_POST['db_pass'])) $inputPass = $_POST['db_pass'];
if (isset($_POST['database'])) $inputDb = $_POST['database'];
if (isset($_POST['mode'])) $inputMode = $_POST['mode'];
if (isset($_POST['limit'])) $inputLimit = intval($_POST['limit']);

// Try to detect DBs with defaults for convenience
try {
    $tmpConn = connect_mysqli($defaultHost, $defaultUser, $defaultPass, $defaultPort);
    $detectedDatabases = get_databases($tmpConn);
    $tmpConn->close();
} catch (Exception $e) {
    // ignore detection error — user can still input credentials
    $detectedDatabases = array();
}

// If user clicked "Load tables", connect with provided credentials and fetch tables + counts
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'load_tables') {
    try {
        $conn = connect_mysqli($inputHost, $inputUser, $inputPass, $inputPort);
        if ($inputDb === '') {
            $errors[] = "Please select or enter a database name to load tables.";
        } else {
            $loadedTables = get_tables_with_counts($conn, $inputDb);
            if (empty($loadedTables)) {
                $errors[] = "No tables found in database " . htmlspecialchars($inputDb) . ".";
            }
        }
        $conn->close();
    } catch (Exception $e) {
        $errors[] = "Could not connect: " . $e->getMessage();
    }
}

// If user clicked "Export selected", perform export for selected tables only
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'export') {
    // gather selections
    $selectedTables = array();
    if (isset($_POST['tables']) && is_array($_POST['tables'])) {
        foreach ($_POST['tables'] as $t) $selectedTables[] = $t;
    }
    // if none selected, treat as all tables (but we will fetch all tables to export)
    try {
        $conn = connect_mysqli($inputHost, $inputUser, $inputPass, $inputPort);
    } catch (Exception $e) {
        $errors[] = "Could not connect: " . $e->getMessage();
        $conn = null;
    }

        // --- Export handling (replace existing export block) ---
    if ($conn && $inputDb !== '') {
        // ensure the connection is using the selected database
        if (! $conn->select_db($inputDb)) {
            $errors[] = "Could not select database " . htmlspecialchars($inputDb) . ": " . $conn->error;
        } else {
            // if no tables selected, export all tables
            if (empty($selectedTables)) {
                $tlist = get_tables_with_counts($conn, $inputDb);
                $selectedTables = array();
                foreach ($tlist as $tinfo) $selectedTables[] = $tinfo['name'];
            }

            // build SQL
            $sql = array();
            $sql[] = "-- Generated SQL export (safe). DB host: " . htmlspecialchars($inputHost) . "\n";
            $sql[] = "CREATE DATABASE IF NOT EXISTS " . escape_identifier($inputDb) . ";\n";
            $sql[] = "USE " . escape_identifier($inputDb) . ";\n\n";

            foreach ($selectedTables as $tbl) {
                // Schema
                if ($inputMode === 'schema_only' || $inputMode === 'schema_and_data') {
                    $create = get_create_table($conn, $tbl);
                    if ($create) {
                        $sql[] = "-- ----------------------------\n";
                        $sql[] = "-- Table structure for " . escape_identifier($tbl) . "\n";
                        $sql[] = "-- ----------------------------\n";
                        $sql[] = "# DROP TABLE IF EXISTS " . escape_identifier($tbl) . ";\n";
                        $sql[] = $create . ";\n\n";
                    } else {
                        $sql[] = "-- Could not get CREATE TABLE for " . escape_identifier($tbl) . " (skipped)\n\n";
                    }
                }
                // Data
                if ($inputMode === 'data_only' || $inputMode === 'schema_and_data') {
                    $rows = fetch_rows($conn, $tbl, $inputLimit);
                    if (!empty($rows)) {
                        $sql[] = "-- ----------------------------\n";
                        $sql[] = "-- Data for table " . escape_identifier($tbl) . " (up to " . intval($inputLimit) . " rows)\n";
                        $sql[] = "-- ----------------------------\n";
                        $cols = array_keys($rows[0]);
                        $colListParts = array();
                        foreach ($cols as $c) $colListParts[] = escape_identifier($c);
                        $colList = implode(", ", $colListParts);
                        $valuesParts = array();
                        foreach ($rows as $r) {
                            $vals = array();
                            foreach ($cols as $c) {
                                $vals[] = value_to_sql(isset($r[$c]) ? $r[$c] : null, $conn);
                            }
                            $valuesParts[] = "(" . implode(", ", $vals) . ")";
                        }
                        $sql[] = "INSERT IGNORE INTO " . escape_identifier($tbl) . " (" . $colList . ") VALUES\n";
                        $sql[] = implode(",\n", $valuesParts) . ";\n\n";
                    } else {
                        $sql[] = "-- (No rows exported for table " . escape_identifier($tbl) . ")\n\n";
                    }
                }
            }

            // send file
            if (empty($errors)) {
                $filename = "export_" . preg_replace('/[^A-Za-z0-9_\-]/', '_', $inputDb) . "_" . date('Ymd_His') . ".sql";
                $content = implode("", $sql);

                header('Content-Description: File Transfer');
                header('Content-Type: application/sql; charset=utf-8');
                header('Content-Disposition: attachment; filename="' . $filename . '"');
                header('Expires: 0');
                header('Cache-Control: must-revalidate');
                header('Pragma: public');
                header('Content-Length: ' . strlen($content));
                echo $content;
                $conn->close();
                exit;
            }
        }
        $conn->close();
    }

}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Safe SQL Exporter — Select Tables</title>
<style>
body { font-family: Arial, sans-serif; background:#f7f7f7; padding:24px; }
.card { background:white; padding:20px; border-radius:8px; max-width:1000px; margin:0 auto; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
label { display:block; margin-top:10px; font-weight:600; }
input, select { padding:8px; width:100%; box-sizing:border-box; margin-top:6px; }
.row { display:flex; gap:12px; }
.col { flex:1; }
button { margin-top:14px; padding:10px 16px; background:#007bff; color:#fff; border:none; border-radius:6px; cursor:pointer;}
.error { background:#ffecec; padding:10px; color:#b00020; border-radius:6px; }
.note { color:#555; font-size:13px; margin-top:8px; }
.small { font-size:13px; color:#666; }
.table-list { margin-top:12px; border-collapse:collapse; width:100%; }
.table-list th, .table-list td { border:1px solid #e3e3e3; padding:8px; text-align:left; }
.table-list th { background:#fafafa; }
.count-badge { background:#f1f1f1; padding:4px 8px; border-radius:4px; font-size:13px; color:#333; }
.select-all { margin-bottom:8px; display:inline-block; cursor:pointer; color:#007bff; }
</style>
<script type="text/javascript">
// Simple select all toggle
function toggleSelectAll(checked) {
    var boxes = document.getElementsByName('tables[]');
    for (var i=0;i<boxes.length;i++) {
        boxes[i].checked = checked;
    }
}
function selectAllClick() {
    var all = document.getElementById('select_all');
    toggleSelectAll(all.checked);
}
</script>
</head>
<body>
<div class="card">
    <h2>Safe SQL Exporter — Select Tables</h2>

    <?php if (!empty($errors)): ?>
        <div class="error">
            <?php foreach ($errors as $e) echo htmlspecialchars($e) . "<br/>"; ?>
        </div>
    <?php endif; ?>

    <form method="post">
        <div class="row">
            <div class="col">
                <label>DB Host</label>
                <input name="db_host" value="<?php echo htmlspecialchars($inputHost); ?>">
            </div>
            <div class="col">
                <label>Port</label>
                <input name="db_port" value="<?php echo htmlspecialchars($inputPort); ?>">
            </div>
        </div>

        <div class="row">
            <div class="col">
                <label>User</label>
                <input name="db_user" value="<?php echo htmlspecialchars($inputUser); ?>">
            </div>
            <div class="col">
                <label>Password</label>
                <input name="db_pass" type="password" value="<?php echo htmlspecialchars($inputPass); ?>">
            </div>
        </div>

        <label>Choose Database</label>
        <select name="database">
            <option value="">-- select database --</option>
            <?php
            foreach ($detectedDatabases as $d) {
                $sel = ($d === $inputDb) ? ' selected' : '';
                echo '<option value="' . htmlspecialchars($d) . '"' . $sel . '>' . htmlspecialchars($d) . '</option>';
            }
            ?>
        </select>
        <div class="small">If your DB not shown, type its name in the field below and click "Load tables".</div>

        <label>Or enter DB name</label>
        <input name="database" value="<?php echo htmlspecialchars($inputDb); ?>">

        <label>Export Mode</label>
        <select name="mode">
            <option value="schema_and_data" <?php if ($inputMode === 'schema_and_data') echo 'selected'; ?>>Schema + Data (limited)</option>
            <option value="schema_only" <?php if ($inputMode === 'schema_only') echo 'selected'; ?>>Schema only</option>
            <option value="data_only" <?php if ($inputMode === 'data_only') echo 'selected'; ?>>Data only (limited)</option>
        </select>

        <label>Row limit per table (when exporting data)</label>
        <input name="limit" value="<?php echo htmlspecialchars($inputLimit); ?>" type="number" min="1">

        <div style="margin-top:12px;">
            <button type="submit" name="action" value="load_tables">🔄 Load tables</button>
            <span class="note">After tables load you can select which tables to export.</span>
        </div>

        <?php if (!empty($loadedTables)): ?>
            <hr/>
            <h3>Tables in <?php echo htmlspecialchars($inputDb); ?></h3>
            <div>
                <label><input type="checkbox" id="select_all" onclick="selectAllClick()"> Select All</label>
            </div>
            <table class="table-list">
                <tr><th style="width:4em">Sel</th><th>Table Name</th><th style="width:10em">Row count</th></tr>
                <?php foreach ($loadedTables as $tinfo): ?>
                    <tr>
                        <td><input type="checkbox" name="tables[]" value="<?php echo htmlspecialchars($tinfo['name']); ?>"></td>
                        <td><?php echo htmlspecialchars($tinfo['name']); ?></td>
                        <td><span class="count-badge"><?php echo ($tinfo['count'] === null) ? 'N/A' : number_format($tinfo['count']); ?></span></td>
                    </tr>
                <?php endforeach; ?>
            </table>

            <div style="margin-top:12px;">
                <button type="submit" name="action" value="export">💾 Export selected tables</button>
                <span class="note">If no table is selected, the exporter will export all tables.</span>
            </div>
        <?php endif; ?>

    </form>

    <hr/>
    <div class="note">
        This script <strong>does not run</strong> any destructive SQL. It only generates a downloadable .sql file containing:
        <ul>
            <li><code>CREATE DATABASE IF NOT EXISTS</code></li>
            <li><code>USE &lt;db&gt;</code></li>
            <li>Table definitions (<code>SHOW CREATE TABLE</code>) — DROP statements are commented out</li>
            <li>INSERT statements for up to the specified number of rows per table (INSERT IGNORE used)</li>
        </ul>
        <strong>Security:</strong> Use locally/dev only. Do not expose this publicly without authentication. Counting rows on very large tables may be slow.
    </div>
</div>
</body>
</html>
