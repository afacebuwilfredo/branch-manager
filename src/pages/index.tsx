// pages/index.tsx
import { useState, useEffect } from "react";

interface Site {
  id: string;
  name: string;
  url: string;
  assigned: string;
  activeBranch: string;
  branches: string[];
  server: string;
  folderPath: string;
  commandOutput?: string;
}

const initialSites: Site[] = [
  { id: '1', name: 'colombianlady', url: 'http://colombianlady.cenix', assigned: 'afacebu.wilfredo@gmail.com', activeBranch: '', branches: ["loading"], server: 'sftp', folderPath: 'R:/WebServer2/colombianlady.com' },
  { id: '2', name: 'barranquilladating', url: 'http://barranquilladating.cenix', assigned: 'afacebu.randy@gmail.com', activeBranch: 'main', branches: ['loading'], server: 'ftp', folderPath: 'R:/WebServer2/barranquilladating.com' },
  { id: '3', name: 'poltavawomen', url: 'http://poltavawomen.cenix', assigned: 'afacebu.jestoni@gmail.com', activeBranch: '', branches: ['loading'], server: 'ftp', folderPath: 'R:/WebServer2/poltavawomen.com' },
  { id: '4', name: 'philippine-women', url: 'http://philippine-women.cenix', assigned: 'afacebu.wilfredo@gmail.com', activeBranch: '', branches: ['loading'], server: 'ftp', folderPath: 'R:/WebServer2/philippine-women.com' },
  { id: '5', name: 'manila-women',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://manila-women.cenix', folderPath: 'R:/WebServer5/manila-women.com', assigned: 'afacebu.ayie@gmail.com', },
  { id: '6', name: 'cartagenawomen', activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://cartagenawomen.cenix', folderPath: 'R:/WebServer2/cartagenawomen.com', assigned: 'afacebu.ayie@gmail.com', },
  { id: '7', name: 'cartagenadating', activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://cartagenadating.cenix', folderPath: 'R:/WebServer2/cartagenadating.com', assigned: 'afacebu.ayie@gmail.com', },
  { id: '8', name: 'cebuwomen', activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://cebuwomen.cenix', folderPath: 'R:/WebServer2/cebuwomen.com', assigned: 'afacebu.ayie@gmail.com', },
  { id: '9', name: 'filipino-women', activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://filipino-women.cenix', folderPath: 'R:/WebServer5/filipino-women.com', assigned: 'afacebu.ayie@gmail.com', },
  { id: '10', name: 'filipino-bridex',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://filipino-bride.cenix',folderPath: 'R:/WebServer5/filipino-bride.com',assigned: 'afacebu.ayie@gmail.com',},
  { id: '11', name: 'dateintx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://dateint.cenix',folderPath: 'R:/WebServers/dateint.com',assigned: 'afacebu.ayie@gmail.com',},
  { id: '12', name: 'latin-personalsx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://latin-personals.cenix',folderPath: 'R:/WebServer3/latin-personals.com',assigned: 'afacebu.ayie@gmail.com',},
  { id: '13', name: 'international-datingx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://international-dating.cenix',folderPath: 'R:/WebServer5/international-dating.com',assigned: 'afacebu.ayie@gmail.com',},
  { id: '14',server: 'ftp', name: 'loveme.cenix',activeBranch: 'main', branches: ['loading'], url: 'http://loveme.cenix',folderPath: 'R:/WebServer2/loveme.com',assigned: 'afacebu.ayie@gmail.com',},
  { id: '15', name: 'china-bridesx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://china-brides.cenix',folderPath: 'R:/WebServer5/china-brides.com',assigned: 'afacebu.jestoni@gmail.com',},
  { id: '16', name: 'barranquillasinglesx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://barranquillasingles.cenix',folderPath: 'R:/WebServer2/barranquillasingles.com',assigned: 'afacebu.jestoni@gmail.com',},
  { id: '17', name: '1stlatinwomenx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://1stlatinwomen.cenix',folderPath: 'R:/WebServer2/1stlatinwomen.com',assigned: 'afacebu.jestoni@gmail.com',},
  { id: '18', name: 'asian-womenx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://asian-women.cenix',folderPath: 'R:/WebServer5/asian-women.com',assigned: 'afacebu.jestoni@gmail.com',},
  { id: '19', name: 'honduraswomenx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://honduraswomen.cenix',folderPath: 'R:/WebServer2/honduraswomen.com',assigned: 'afacebu.jestoni@gmail.com',},
  { id: '20', name: 'islandladiesx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://islandladies.cenix',folderPath: 'R:/WebServer5/islandladies.com',assigned: 'afacebu.abraham@gmail.com',},
  { id: '21', name: 'asianlovematesx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://asianlovemates.cenix',folderPath: 'R:/WebServer5/asianlovemates.com',assigned: 'afacebu.abraham@gmail.com',},
  { id: '22', name: 'anewbridex',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://anewbride.cenix',folderPath: 'R:/WebServer2/anewbride.com',assigned: 'afacebu.abraham@gmail.com',},
  { id: '23', name: 'mexicanlovematesx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://mexicanlovemates.cenix',folderPath: 'R:/WebServer5/mexicanlovemates.com',assigned: 'afacebu.abraham@gmail.com',},
  { id: '24', name: 'a-foreign-affairx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://a-foreign-affair.cenix',folderPath: 'R:/WebServer2/a-foreign-affair.com',assigned: 'afacebu.abraham@gmail.com',},
  { id: '25', name: 'colombianwomanx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://colombianwoman.cenix',folderPath: 'R:/WebServer2/colombianwoman.com',assigned: 'afacebu.abraham@gmail.com',},
  { id: '26', name: 'bangkok-women', activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://bangkok-women.cenix', folderPath: 'R:/WebServer2/bangkok-women.com', assigned: 'afacebu.joseanthony@gmail.com',},
  { id: '27', name: 'ukraineladies', activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://ukraineladies.cenix', folderPath: 'R:/WebServer5/ukraineladies.com', assigned: 'afacebu.joseanthony@gmail.com',},
  { id: '28', name: 'costa-rica-women', activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://costa-rica-women.cenix', folderPath: 'R:/WebServer2/costa-rica-women.com', assigned: 'afacebu.joseanthony@gmail.com',},
  { id: '29', name: 'medellinsingles', activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://medellinsingles.cenix', folderPath: 'R:/WebServer3/medellinsingles.com', assigned: 'afacebu.joseanthony@gmail.com',},
  { id: '30', name: 'ukrainesingles', activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://ukrainesingles.cenix', folderPath: 'R:/WebServer5/ukrainesingles.com', assigned: 'afacebu.joseanthony@gmail.com',},
  { id: '31', name: 'russia-ladies', activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://russia-ladies.cenix', folderPath: 'R:/WebServer2/russia-ladies.com', assigned: 'afacebu.joseanthony@gmail.com',},
  { id: '32', name: 'moscowladiesx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://moscowladies.cenix',folderPath: 'R:/WebServer2/moscowladies.com',assigned: 'afacebu.wilfredo@gmail.com',},
  { id: '33', name: 'poltavawomenx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://poltavawomen.cenix',folderPath: 'R:/WebServer2/poltavawomen.com',assigned: 'afacebu.wilfredo@gmail.com',},
  { id: '34', name: 'philippine-womenx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://philippine-women.cenix',folderPath: 'R:/WebServer2/philippine-women.com',assigned: 'afacebu.wilfredo@gmail.com',},
  { id: '35', name: 'colombianbridex',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://colombianbride.cenix',folderPath: 'R:/c_women/colombianbride.com',assigned: 'afacebu.wilfredo@gmail.com',},
  { id: '36', name: 'foreignbride.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://foreignbride.cenix',folderPath: 'R:/c_afill/foreignbride.com',assigned: 'afacebu.wilfredo@gmail.com',},
  { id: '37', name: 'kievpersonalsx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://kievpersonals.cenix',folderPath: 'R:/WebServer5/kievpersonals.com',assigned: 'afacebu.randy@gmail.com',},
  { id: '38', name: 'saint-petersburg-womenx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://saint-petersburg-women.cenix',folderPath: 'R:/WebServer2/saint-petersburg-women.com',assigned: 'afacebu.randy@gmail.com',},
  { id: '39', name: 'cityofbridesx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://cityofbrides.cenix',folderPath: 'R:/WebServer2/cityofbrides.com',assigned: 'afacebu.randy@gmail.com',},
  { id: '40', name: 'foreignlovematesx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://foreignlovemates.cenix',folderPath: 'R:/WebServer5/foreignlovemates.com',assigned: 'afacebu.randy@gmail.com',},
  { id: '41', name: 'anewwifex',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://anewwife.cenix',folderPath: 'R:/WebServer2/anewwife.com',assigned: 'afacebu.randy@gmail.com',},
  { id: '42', name: 'colombianmatchx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://colombianmatch.cenix',folderPath: 'R:/WebServersOffices/colombianmatch.com',assigned: 'afacebu.randy@gmail.com',},
  { id: '43', name: 'mydreamasianx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://mydreamasian.cenix',folderPath: 'R:/WebServer5/mydreamasian.com',assigned: 'afacebu.melmarx@gmail.com',},
  { id: '44', name: 'acapulcowomenx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://acapulcowomen.cenix',folderPath: 'R:/WebServer2/acapulcowomen.com',assigned: 'afacebu.melmarx@gmail.com',},
  { id: '45', name: 'mexico-womenx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://mexico-women.cenix',folderPath: 'R:/WebServer5/mexico-women.com',assigned: 'afacebu.melmarx@gmail.com',},
  { id: '46', name: 'medellindatingx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://medellindating.cenix',folderPath: 'R:/WebServer2/medellindating.com',assigned: 'afacebu.melmarx@gmail.com',},
  { id: '47', name: 'latinlovematesx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://latinlovemates.cenix',folderPath: 'R:/WebServer5/latinlovemates.com',assigned: 'afacebu.melmarx@gmail.com',},
  { id: '48', name: 'datefitgirlsx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://datefitgirls.cenix',folderPath: 'R:/WebServersCharlie/datefitgirls.com',assigned: 'afacebu.melmarx@gmail.com',},
  { id: '49', name: 'singlewomenonlinex',activeBranch: 'main', branches: ['loading'], server: 'sftp', url: 'http://singlewomenonline.cenix',folderPath: 'R:/sftp/singlewomenonline.com',assigned: 'afacebu.melmarx@gmail.com',},
  { id: '50', name: 'afabangkokx',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://afabangkok.cenix',folderPath: 'R:/WebServer5/afabangkok.com',assigned: 'afacebu.melmarx@gmail.com',},
  { id: '51', name: 'a-foreign-affair.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://a-foreign-affair.cenix',folderPath: 'R:/WebServer2/a-foreign-affair.net',assigned: 'cebu.devon@gmail.com',},
  { id: '52', name: 'colombianlady.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://colombianlady.cenix',folderPath: 'R:/WebServer2/colombianlady.com',assigned: 'cebu.devon@gmail.com',},
  { id: '53', name: 'barranquilladating.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://barranquilladating.cenix',folderPath: 'R:/WebServer2/barranquilladating.com',assigned: 'cebu.devon@gmail.com',},
  { id: '54', name: 'medellinwomen.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://medellinwomen.cenix',folderPath: 'R:/WebServer2/medellinwomen.com',assigned: 'cebu.devon@gmail.com',},
  { id: '55', name: 'perudating.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://perudating.cenix',folderPath: 'R:/c_affil/perudating.com',assigned: 'cebu.devon@gmail.com',},
  { id: '56', name: 'peru-women.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://peru-women.cenix',folderPath: 'R:/WebServer2/peru-women.com',assigned: 'cebu.devon@gmail.com',},
  { id: '57', name: 'davaowomen.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://davaowomen.cenix',folderPath: 'R:/WebServer5/davaowomen.com',assigned: 'afacebu.benjiebroa@gmail.com',},
  { id: '58', name: 'foreign-affair.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://foreign-affair.cenix',folderPath: 'R:/WebServer2/foreign-affair.net',assigned: 'afacebu.benjiebroa@gmail.com',},
  { id: '59', name: 'thailand-women.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://thailand-women.cenix',folderPath: 'R:/WebServer5/thailand-women.com',assigned: 'afacebu.benjiebroa@gmail.com',},
  { id: '60', name: 'shenzhenwomen.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://shenzhenwomen.cenix',folderPath: 'R:/WebServer2/shenzhenwomen.com',assigned: 'afacebu.benjiebroa@gmail.com',},
  { id: '61', name: '1stchoicedating.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://1stchoicedating.cenix',folderPath: 'R:/WebServer2/1stchoicedating.com',assigned: 'afacebu.benjiebroa@gmail.com',},
  { id: '62', name: 'hondurasdating.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://hondurasdating.cenix',folderPath: 'R:/WebServer2/hondurasdating.com',assigned: 'afacebu.benjiebroa@gmail.com',},
  { id: '63', name: 'russia-women.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://russia-women.cenix',folderPath: 'R:/WebServer2/russia-women.com',assigned: 'afacebu.yevgenygrazio@gmail.com',},
  { id: '64', name: 'colombiandating.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://colombiandating.cenix',folderPath: 'R:/c_affil/colombiandating.com',assigned: 'afacebu.yevgenygrazio@gmail.com',},
  { id: '65', name: 'mymailorderbride.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://mymailorderbride.cenix',folderPath: 'R:/WebServer2/mymailorderbride.com',assigned: 'afacebu.yevgenygrazio@gmail.com',},
  { id: '66', name: 'cali-women.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://cali-women.cenix',folderPath: 'R:/WebServer2/cali-women.com',assigned: 'afacebu.yevgenygrazio@gmail.com',},
  { id: '67', name: 'foreignladies.cenix',activeBranch: 'main', branches: ['loading'], server: 'sftp', url: 'http://foreignladies.cenix',folderPath: 'R:/sftp/foreignladies.com',assigned: 'afacebu.yevgenygrazio@gmail.com',},
  { id: '68', name: 'barranquillawomen.cenix',activeBranch: 'main', branches: ['loading'], server: 'ftp', url: 'http://barranquillawomen.cenix',folderPath: 'R:/WebServer2/barranquillawomen.com',assigned: 'afacebu.yevgenygrazio@gmail.com',},
  { id: '69', name: 'asialovemates.cenix',activeBranch: 'main', branches: ['loading'],  server: 'sftp',  url: 'http://asialovemates.cenix', folderPath: 'R:/sftp/asialovemates.com', assigned: 'afacebu.yevgenygrazio@gmail.com', },
  { id: '70',  name: 'worldlovemates.cenix', activeBranch: 'main',  branches: ['loading'],  server: 'sftp',  url: 'http://worldlovemates.cenix', folderPath: 'R:/sftp/worldlovemates.com', assigned: 'afacebu.yevgenygrazio@gmail.com', },
  { id: '71',  name: 'kievwomen.cenix', activeBranch: 'main',  branches: ['loading'],  server: 'ftp',  url: 'http://kievwomen.cenix', folderPath: 'R:/WebServer2/kievwomen.com', assigned: 'afacebu.aiujymphyap@gmail.com', },
  { id: '72',  name: 'mexicocitydating.cenix', activeBranch: 'main',  branches: ['loading'],  server: 'ftp',  url: 'http://mexicocitydating.cenix', folderPath: 'R:/WebServer5/mexicocitydating.com', assigned: 'afacebu.aiujymphyap@gmail.com', },
  { id: '73',  name: 'angelsofpassion.cenix', activeBranch: 'main',  branches: ['loading'],  server: 'ftp',  url: 'http://angelsofpassion.cenix', folderPath: 'R:/WebServer2/angelsofpassion.com', assigned: 'afacebu.aiujymphyap@gmail.com', },
  { id: '74',  name: 'shenzhendating.cenix', activeBranch: 'main',  branches: ['loading'],  server: 'ftp',  url: 'http://shenzhendating.cenix', folderPath: 'R:/WebServer2/shenzhendating.com', assigned: 'afacebu.aiujymphyap@gmail.com', },
  { id: '75',  name: 'shanghai-women.cenix', activeBranch: 'main',  branches: ['loading'],  server: 'ftp',  url: 'http://shanghai-women.cenix', folderPath: 'R:/WebServer5/shanghai-women.com', assigned: 'afacebu.aiujymphyap@gmail.com', },
  { id: '76',  name: 'odessawomen.cenix', activeBranch: 'main',  branches: ['loading'],  server: 'ftp',  url: 'http://odessawomen.cenix', folderPath: 'R:/WebServer5/odessawomen.com', assigned: 'afacebu.aiujymphyap@gmail.com', },
  { id: '77',  name: 'eurolovemates.cenix', activeBranch: 'main',  branches: ['loading'],  server: 'sftp',  url: 'http://eurolovemates.cenix', folderPath: 'R:/sftp/eurolovemates.com', assigned: 'afacebu.aiujymphyap@gmail.com', },
  { id: '78',  name: 'latinalovemates.cenix', activeBranch: 'main',  branches: ['loading'],  server: 'sftp',  url: 'http://latinalovemates.cenix', folderPath: 'R:/sftp/latinalovemates.com', assigned: 'afacebu.aiujymphyap@gmail.com', },
];

export default function Home() {
  const [sites, setSites] = useState(initialSites);
  const [searchQuery, setSearchQuery] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("name-asc");
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const filteredSites = sites
    .filter(site => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        site.name.toLowerCase().includes(q) || 
        site.url.toLowerCase().includes(q) || 
        site.folderPath.toLowerCase().includes(q) || 
        site.server.toLowerCase().includes(q) || 
        (site.assigned || '').toLowerCase().includes(q);
      const matchesServer = serverFilter === 'all' || site.server === serverFilter;
      return matchesSearch && matchesServer;
    })
    .sort((a, b) => 
      sortOrder === 'name-asc' 
        ? a.name.localeCompare(b.name) 
        : b.name.localeCompare(a.name)
    );

  async function handleCommand(id: string, cmd: 'branches' | 'folders' | 'status' | 'forcepull') {
    setBusy(prev => ({ ...prev, [id]: true }));
    try {
      const site = sites.find(s => s.id === id);
      if (!site) return;
      const resp = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd, cwd: site.folderPath }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || `Failed to ${cmd === 'branches' ? 'get branches' : 'list folders'}`);
      }

      // For branches, parse stdout into an array and update site.branches
      if (cmd === 'branches') {
        const branches = (data.stdout || '')
          .split(/\r?\n/)
          .map((b: string) => b.trim())
          .filter(Boolean);

        setSites(prev => prev.map(s => {
          if (s.id !== id) return s;
          // Always use the current git branch as the active branch when listing branches
          const currentBranch: string | undefined = data.currentBranch;
          // Set activeBranch to currentBranch if it exists in the branch list, otherwise keep existing or use first
          const active = currentBranch && branches.includes(currentBranch) 
            ? currentBranch 
            : (s.activeBranch && branches.includes(s.activeBranch) ? s.activeBranch : branches[0] || '');
          return { ...s, branches, activeBranch: active, commandOutput: data.stdout };
        }));
      } else {
        setSites(prev => prev.map(s => s.id === id ? { ...s, commandOutput: data.stdout } : s));
      }
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setBusy(prev => ({ ...prev, [id]: false }));
    }
  }

  // Optionally pre-load branches for all sites on mount (non-blocking)
  useEffect(() => {
    sites.forEach(s => {
      // don't block UI; fire-and-forget
      (async () => {
        try {
          const resp = await fetch('/api/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd: 'branches', cwd: s.folderPath }),
          });
          const data = await resp.json();
          if (resp.ok && data.ok) {
            const branches = (data.stdout || '')
              .split(/\r?\n/)
              .map((b: string) => b.trim())
              .filter(Boolean);
            const currentBranch: string | undefined = data.currentBranch;
            setSites(prev => prev.map(p => {
              if (p.id !== s.id) return p;
              // Set activeBranch to currentBranch if it exists in the branch list
              const active = currentBranch && branches.includes(currentBranch)
                ? currentBranch
                : (p.activeBranch && branches.includes(p.activeBranch) ? p.activeBranch : branches[0] || '');
              return { ...p, branches, activeBranch: active };
            }));
          }
        } catch {
          // ignore per-site errors during initial load
        }
      })();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAction(id: string, action: 'pull' | 'rebase') {
    setBusy(prev => ({ ...prev, [id]: true }));
    try {
      if (action === 'pull') {
        const site = sites.find(s => s.id === id);
        if (!site) return;

        const resp = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            cmd: "list",
            cwd: site.folderPath
          }),
        });
        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          throw new Error(data.error || 'Failed to pull branch');
        }
      } else if (action === 'rebase') {
        // Simulate rebase action
        await new Promise(r => setTimeout(r, 900));
        alert('Rebase simulated');
      }
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setBusy(prev => ({ ...prev, [id]: false }));
    }
  }

  async function handleCheckout(siteId: string, branch: string) {
    setBusy(prev => ({ ...prev, [siteId]: true }));
    try {
      const site = sites.find(s => s.id === siteId);
      if (!site) return;
      const resp = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'checkout', cwd: site.folderPath, branch }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || 'Checkout failed');
      }

      // update activeBranch on success
      setSites(prev => prev.map(s => s.id === siteId ? { ...s, activeBranch: branch, commandOutput: data.stdout || '' } : s));
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'An error occurred during checkout');
    } finally {
      setBusy(prev => ({ ...prev, [siteId]: false }));
    }
  }

  return (
    <div className="container">
      <header>
        <h1>Website Branch Manager</h1>
        <div className="controls">
          <input
            type="text"
            placeholder="Search website or url"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <select 
            value={serverFilter}
            onChange={e => setServerFilter(e.target.value)}
          >
            <option value="all">All servers</option>
            <option value="ftp">FTP</option>
            <option value="sftp">SFTP</option>
          </select>
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
          >
            <option value="name-asc">Name ↑</option>
            <option value="name-desc">Name ↓</option>
          </select>
        </div>
      </header>

      <main>
        <ul className="sites">
          {filteredSites.length === 0 ? (
            <li className="site muted">No websites match your search.</li>
          ) : (
            filteredSites.map(site => (
              <li key={site.id} className="site">
                <div className="meta">
                  <div>
                    <a href={site.url} target="_blank" rel="noopener noreferrer">
                      {site.name}
                    </a>
                    <div className="small">{site.url}</div>
                    <div className="small">
                      Server: <strong>{site.server}</strong> • Path: <code>{site.folderPath}</code>
                    </div>
                  </div>
                  <div className="small">
                    Active<br/>
                    <strong>{site.activeBranch}</strong>
                    <div>{site.assigned || '—'}</div>
                  </div>
                </div>
                <div className="row">
                  <label>Branch</label>
                  <select 
                    value={site.activeBranch}
                    onChange={e => {
                      const newBranch = e.target.value;
                      // optimistically set selected branch, then attempt checkout
                      setSites(prev => prev.map(s => s.id === site.id ? { ...s, activeBranch: newBranch } : s));
                      handleCheckout(site.id, newBranch);
                    }}
                  >
                    {site.branches.map(branch => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn"
                    onClick={() => handleAction(site.id, 'pull')}
                    disabled={busy[site.id]}
                  >
                    {busy[site.id] ? 'Pulling…' : 'Pull branch'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => handleAction(site.id, 'rebase')}
                    disabled={busy[site.id]}
                  >
                    {busy[site.id] ? 'Working…' : 'Rebase'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => handleCommand(site.id, 'branches')}
                    disabled={busy[site.id]}
                  >
                    Show Branches
                  </button>
                  <button
                    className="btn"
                    onClick={() => handleCommand(site.id, 'folders')}
                    disabled={busy[site.id]}
                  >
                    List Folders
                  </button>
                  <button
                    className="btn"
                    onClick={() => handleCommand(site.id, 'status')}
                    disabled={busy[site.id]}
                  >
                    Git Status
                  </button>
                  <button
                    className="btn"
                    onClick={() => handleCommand(site.id, 'forcepull')}
                    disabled={busy[site.id]}
                  >
                    Force Pull
                  </button>
                </div>
                <div className="small muted">
                  Tip: use the dropdown to switch local selection, then Pull to fetch from remote.
                </div>
                {site.commandOutput && (
                  <pre className="command-output">
                    {site.commandOutput}
                  </pre>
                )}
              </li>
            ))
          )}
        </ul>
      </main>
    </div>
  );
}

