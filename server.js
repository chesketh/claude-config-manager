const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = 3847;
const HOME = process.env.USERPROFILE || process.env.HOME;
const CLAUDE_DIR = path.join(HOME, '.claude');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');
const DISABLED_SKILLS_DIR = process.env.CLAUDE_DISABLED_SKILLS_DIR || path.join(CLAUDE_DIR, 'skills-disabled');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
const HOOKS_FILE = path.join(CLAUDE_DIR, 'hooks.json');
const PLUGINS_FILE = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
const PLUGIN_CACHE = path.join(CLAUDE_DIR, 'plugins', 'cache');

// --- Helpers ---

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getSkillMeta(skillDir) {
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) return { name: path.basename(skillDir), description: '' };
  const content = fs.readFileSync(skillMd, 'utf8');
  const meta = { name: path.basename(skillDir), description: '' };
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const nameMatch = fm.match(/^name:\s*(.+)/m);
    const descMatch = fm.match(/^description:\s*(.+)/m);
    if (nameMatch) meta.name = nameMatch[1].trim();
    if (descMatch) meta.description = descMatch[1].trim();
  }
  return meta;
}

function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => {
    try {
      return fs.statSync(path.join(dir, name)).isDirectory();
    } catch { return false; }
  });
}

// --- API ---

app.get('/api/overview', (req, res) => {
  // 1. Skills (active + disabled)
  const activeSkillNames = listDirs(SKILLS_DIR);
  const disabledSkillNames = listDirs(DISABLED_SKILLS_DIR);

  const activeSkills = activeSkillNames.map(name => ({
    ...getSkillMeta(path.join(SKILLS_DIR, name)),
    dirName: name,
    enabled: true,
    source: 'user'
  }));
  const disabledSkills = disabledSkillNames.map(name => ({
    ...getSkillMeta(path.join(DISABLED_SKILLS_DIR, name)),
    dirName: name,
    enabled: false,
    source: 'user'
  }));
  const skills = [...activeSkills, ...disabledSkills].sort((a, b) => a.dirName.localeCompare(b.dirName));

  // 2. Plugins
  const pluginsData = readJson(PLUGINS_FILE) || { plugins: {} };
  const settings = readJson(SETTINGS_FILE) || {};
  const enabledPlugins = settings.enabledPlugins || {};

  const plugins = Object.entries(pluginsData.plugins).map(([id, entries]) => {
    const entry = entries[0];
    // Read plugin.json for display name
    let displayName = id.split('@')[0];
    let pluginDescription = '';
    if (entry && entry.installPath) {
      const pj = readJson(path.join(entry.installPath, '.claude-plugin', 'plugin.json'));
      if (pj) {
        displayName = pj.name || displayName;
        pluginDescription = pj.description || '';
      }
    }
    return {
      id,
      displayName,
      description: pluginDescription,
      scope: entry?.scope || 'unknown',
      version: entry?.version || 'unknown',
      enabled: enabledPlugins[id] !== false, // default true if not in map
      _installPath: entry?.installPath || '' // internal only, stripped before response
    };
  });

  // 3. Hooks
  const hooksData = readJson(HOOKS_FILE) || {};
  const hooksConfig = hooksData.hooks || {};
  const hooks = [];
  for (const [lifecycle, entries] of Object.entries(hooksConfig)) {
    entries.forEach((entry, index) => {
      hooks.push({
        lifecycle,
        index,
        matcher: entry.matcher || '*',
        description: entry.description || 'No description',
        disabled: entry.disabled === true,
        async: entry.hooks?.[0]?.async || false
      });
    });
  }

  // 4. MCP Servers (from plugin .mcp.json files)
  const mcpServers = [];
  for (const plugin of plugins) {
    if (!plugin._installPath) continue;
    const mcpFile = path.join(plugin._installPath, '.mcp.json');
    const mcpData = readJson(mcpFile);
    if (!mcpData) continue;

    // Handle both flat and nested mcpServers format
    const servers = mcpData.mcpServers || {};
    for (const [name, config] of Object.entries(mcpData)) {
      if (name === 'mcpServers') continue;
      mcpServers.push({
        name,
        plugin: plugin.displayName,
        pluginId: plugin.id,
        type: config.type || 'http',
        url: config.url || '',
        enabled: plugin.enabled
      });
    }
    for (const [name, config] of Object.entries(servers)) {
      mcpServers.push({
        name,
        plugin: plugin.displayName,
        pluginId: plugin.id,
        type: config.type || 'http',
        url: config.url || '',
        enabled: plugin.enabled
      });
    }
  }

  // Strip internal paths before sending to client
  const safePlugins = plugins.map(({ _installPath, ...rest }) => rest);
  res.json({ skills, plugins: safePlugins, hooks, mcpServers });
});

// Toggle skill
app.post('/api/skills/:name/toggle', (req, res) => {
  const { name } = req.params;
  const activePath = path.join(SKILLS_DIR, name);
  const disabledPath = path.join(DISABLED_SKILLS_DIR, name);

  try {
    if (fs.existsSync(activePath)) {
      // Disable: move to Claudetemp
      ensureDir(DISABLED_SKILLS_DIR);
      fs.renameSync(activePath, disabledPath);
      res.json({ success: true, enabled: false, message: `Disabled skill: ${name}` });
    } else if (fs.existsSync(disabledPath)) {
      // Enable: move back
      ensureDir(SKILLS_DIR);
      fs.renameSync(disabledPath, activePath);
      res.json({ success: true, enabled: true, message: `Enabled skill: ${name}` });
    } else {
      res.status(404).json({ success: false, message: `Skill not found: ${name}` });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Toggle plugin
app.post('/api/plugins/:id/toggle', (req, res) => {
  const pluginId = decodeURIComponent(req.params.id);
  try {
    const settings = readJson(SETTINGS_FILE) || {};
    if (!settings.enabledPlugins) settings.enabledPlugins = {};
    const current = settings.enabledPlugins[pluginId] !== false;
    settings.enabledPlugins[pluginId] = !current;
    writeJson(SETTINGS_FILE, settings);
    res.json({ success: true, enabled: !current, message: `${!current ? 'Enabled' : 'Disabled'} plugin: ${pluginId}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Toggle hook
app.post('/api/hooks/:lifecycle/:index/toggle', (req, res) => {
  const { lifecycle, index } = req.params;
  const idx = parseInt(index, 10);
  try {
    const hooksData = readJson(HOOKS_FILE) || {};
    const hooks = hooksData.hooks || {};
    if (!hooks[lifecycle] || !hooks[lifecycle][idx]) {
      return res.status(404).json({ success: false, message: 'Hook not found' });
    }
    const hook = hooks[lifecycle][idx];
    if (hook.disabled) {
      delete hook.disabled;
    } else {
      hook.disabled = true;
    }
    writeJson(HOOKS_FILE, hooksData);
    res.json({ success: true, disabled: hook.disabled === true, message: `Hook ${hook.disabled ? 'disabled' : 'enabled'}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Bulk toggle skills
app.post('/api/skills/bulk', (req, res) => {
  const { names, enable } = req.body;
  if (!Array.isArray(names)) return res.status(400).json({ success: false, message: 'names must be an array' });
  const results = [];
  for (const name of names) {
    const activePath = path.join(SKILLS_DIR, name);
    const disabledPath = path.join(DISABLED_SKILLS_DIR, name);
    try {
      if (enable && fs.existsSync(disabledPath)) {
        ensureDir(SKILLS_DIR);
        fs.renameSync(disabledPath, activePath);
        results.push({ name, success: true, enabled: true });
      } else if (!enable && fs.existsSync(activePath)) {
        ensureDir(DISABLED_SKILLS_DIR);
        fs.renameSync(activePath, disabledPath);
        results.push({ name, success: true, enabled: false });
      } else {
        results.push({ name, success: false, message: 'Not found or already in target state' });
      }
    } catch (err) {
      results.push({ name, success: false, message: err.message });
    }
  }
  res.json({ success: true, results });
});

app.listen(PORT, async () => {
  console.log(`Claude Config Manager running at http://localhost:${PORT}`);
  try {
    const open = (await import('open')).default;
    open(`http://localhost:${PORT}`);
  } catch {
    console.log('Install "open" package for auto-launch, or open the URL manually.');
  }
});
