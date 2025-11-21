<?php
// export_safe.php
// Safe SQL exporter (schema + controlled data). Compatible with older PHP versions.

session_start();

// ---------- CONFIG ----------
$defaultHost = '127.0.0.1';
$defaultUser = 'root';
$defaultPass = '';
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

function get_tables($mysqli, $db) {
    $tables = array();
    $mysqli->select_db($db);
    $res = $mysqli->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    if ($res) {
        while ($row = $res->fetch_row()) $tables[] = $row[0];
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

// ---------- Handle form submission ----------
$errors = array();
$databases = array();
$tables = array();
$detectedDatabases = array();
$mysqld = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    $host = isset($_POST['db_host']) ? $_POST['db_host'] : $defaultHost;
    $port = intval(isset($_POST['db_port']) ? $_POST['db_port'] : $defaultPort);
    $user = isset($_POST['db_user']) ? $_POST['db_user'] : $defaultUser;
    $pass = isset($_POST['db_pass']) ? $_POST['db_pass'] : $defaultPass;
    $db = isset($_POST['database']) ? $_POST['database'] : '';
    $mode = isset($_POST['mode']) ? $_POST['mode'] : 'schema_and_data'; // schema_only, data_only, schema_and_data
    $limit = intval(isset($_POST['limit']) ? $_POST['limit'] : $defaultLimit);

    try {
        $mysqld = connect_mysqli($host, $user, $pass, $port);
    } catch (Exception $e) {
        $errors[] = $e->getMessage();
    }

    if ($mysqld && $db) {
        // build SQL content in memory (string)
        $sql = array();
        $sql[] = "-- Generated SQL export (safe). DB host: " . htmlspecialchars($host) . "\n";
        $sql[] = "CREATE DATABASE IF NOT EXISTS " . escape_identifier($db) . ";\n";
        $sql[] = "USE " . escape_identifier($db) . ";\n\n";

        // get tables
        $tables = get_tables($mysqld, $db);
        if (empty($tables)) {
            $errors[] = "No tables found in database " . htmlspecialchars($db);
        } else {
            foreach ($tables as $tbl) {
                // Schema
                if ($mode === 'schema_only' || $mode === 'schema_and_data') {
                    $create = get_create_table($mysqld, $tbl);
                    if ($create) {
                        $sql[] = "-- ----------------------------\n";
                        $sql[] = "-- Table structure for " . escape_identifier($tbl) . "\n";
                        $sql[] = "-- ----------------------------\n";
                        $sql[] = "# DROP TABLE IF EXISTS " . escape_identifier($tbl) . ";\n";
                        $sql[] = $create . ";\n\n";
                    }
                }

                // Data (limited)
                if ($mode === 'data_only' || $mode === 'schema_and_data') {
                    $rows = fetch_rows($mysqld, $tbl, $limit);
                    if (!empty($rows)) {
                        $sql[] = "-- ----------------------------\n";
                        $sql[] = "-- Data for table " . escape_identifier($tbl) . " (up to " . intval($limit) . " rows)\n";
                        $sql[] = "-- ----------------------------\n";
                        $cols = array_keys($rows[0]);
                        $colListParts = array();
                        foreach ($cols as $c) $colListParts[] = escape_identifier($c);
                        $colList = implode(", ", $colListParts);
                        $valuesParts = array();
                        foreach ($rows as $r) {
                            $vals = array();
                            foreach ($cols as $c) {
                                $vals[] = value_to_sql(isset($r[$c]) ? $r[$c] : null, $mysqld);
                            }
                            $valuesParts[] = "(" . implode(", ", $vals) . ")";
                        }
                        $sql[] = "INSERT IGNORE INTO " . escape_identifier($tbl) . " (" . $colList . ") VALUES\n";
                        $sql[] = implode(",\n", $valuesParts) . ";\n\n";
                    } else {
                        $sql[] = "-- (No rows exported for table " . escape_identifier($tbl) . ")\n\n";
                    }
                }
            } // end foreach tables
        }

        // If there were no errors, send the file as download
        if (empty($errors)) {
            $filename = "export_" . preg_replace('/[^A-Za-z0-9_\-]/', '_', $db) . "_" . date('Ymd_His') . ".sql";
            $content = implode("", $sql);

            // Force download
            header('Content-Description: File Transfer');
            header('Content-Type: application/sql; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Expires: 0');
            header('Cache-Control: must-revalidate');
            header('Pragma: public');
            header('Content-Length: ' . strlen($content));
            echo $content;
            if ($mysqld) $mysqld->close();
            exit;
        }
    }
}

// Attempt initial detection of DBs (using defaults) for form convenience
try {
    $tmpConn = connect_mysqli($defaultHost, $defaultUser, $defaultPass, $defaultPort);
    $detectedDatabases = get_databases($tmpConn);
    $tmpConn->close();
} catch (Exception $e) {
    $detectedDatabases = array();
    $errors[] = "Could not detect databases using defaults: " . $e->getMessage();
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Safe SQL Exporter</title>
<style>
body { font-family: Arial, sans-serif; background:#f7f7f7; padding:30px; }
.card { background:white; padding:20px; border-radius:8px; max-width:900px; margin:0 auto; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
label { display:block; margin-top:10px; font-weight:600; }
input, select { padding:8px; width:100%; box-sizing:border-box; margin-top:6px; }
.row { display:flex; gap:12px; }
.col { flex:1; }
button { margin-top:14px; padding:10px 16px; background:#007bff; color:#fff; border:none; border-radius:6px; cursor:pointer;}
.error { background:#ffecec; padding:10px; color:#b00020; border-radius:6px; }
.note { color:#555; font-size:13px; margin-top:8px; }
.small { font-size:13px; color:#666; }
</style>
</head>
<body>
<div class="card">
    <h2>Safe SQL Exporter (schema + controlled data)</h2>

    <?php if (!empty($errors)): ?>
        <div class="error">
            <?php foreach ($errors as $e) echo htmlspecialchars($e) . "<br/>"; ?>
        </div>
    <?php endif; ?>

    <form method="post">
        <div class="row">
            <div class="col">
                <label>DB Host</label>
                <input name="db_host" value="<?php echo htmlspecialchars($defaultHost); ?>">
            </div>
            <div class="col">
                <label>Port</label>
                <input name="db_port" value="<?php echo htmlspecialchars($defaultPort); ?>">
            </div>
        </div>

        <div class="row">
            <div class="col">
                <label>User</label>
                <input name="db_user" value="<?php echo htmlspecialchars($defaultUser); ?>">
            </div>
            <div class="col">
                <label>Password</label>
                <input name="db_pass" type="password" value="<?php echo htmlspecialchars($defaultPass); ?>">
            </div>
        </div>

        <label>Choose Database</label>
        <select name="database" required>
            <option value="">-- select database --</option>
            <?php foreach ($detectedDatabases as $d): ?>
                <option value="<?php echo htmlspecialchars($d); ?>"><?php echo htmlspecialchars($d); ?></option>
            <?php endforeach; ?>
        </select>
        <div class="small">If your DB not shown, enter credentials above and submit (it will connect and export).</div>

        <label>Export Mode</label>
        <select name="mode">
            <option value="schema_and_data">Schema + Data (limited)</option>
            <option value="schema_only">Schema only</option>
            <option value="data_only">Data only (limited)</option>
        </select>

        <label>Row limit per table (when exporting data)</label>
        <input name="limit" value="<?php echo htmlspecialchars($defaultLimit); ?>" type="number" min="1">

        <div class="note">
            This script <strong>does not run</strong> any destructive SQL. It only generates a .sql file containing:
            <ul>
                <li><code>CREATE DATABASE IF NOT EXISTS</code></li>
                <li><code>USE &lt;db&gt;</code></li>
                <li>Table definitions (<code>SHOW CREATE TABLE</code>) — DROP statements are commented out</li>
                <li>INSERT statements for up to the specified number of rows per table (INSERT IGNORE used to avoid duplicate errors)</li>
            </ul>
            <b>Important:</b> review the generated SQL before running it in production. Always test first on a staging copy.
        </div>

        <button type="submit" name="action" value="export">📄 Generate & Download SQL</button>
    </form>
</div>
</body>
</html>
