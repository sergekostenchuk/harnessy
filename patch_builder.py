with open('/Users/kostenchuksergey/REPORTS/workbench-design/build_unified.py') as f:
    code = f.read()

# Fix ladder
code = code.replace(
    'chip.textContent = `L${l.level} ${l.title}`;',
    'chip.textContent = l.title || l.id;'
)

# Fix boundary
code = code.replace(
    "set('i-boundary', n.boundary);",
    "set('i-boundary', (typeof n.boundary === 'object' && n.boundary !== null) ? Object.entries(n.boundary).map(([k,v]) => k + ': ' + v).join(' · ') : (n.boundary || '—'));"
)

# Fix ports
code = code.replace(
    'portsHTML = \'<div class="nd-ports">\' + n.ports.map(p => `<span class="nd-port">${p.name}</span>`).join(\'\') + \'</div>\';',
    'portsHTML = \'<div class="nd-ports">\' + n.ports.map(p => \'<span class="nd-port">\' + (typeof p === \'string\' ? p : (p.name || p.id || \'\')) + \'</span>\').filter(s => !s.includes(\'undefined\')).join(\'\') + \'</div>\';'
)

# Fix evCount
code = code.replace(
    'const evCount = MAP.events ? MAP.events.length : 2729;',
    'const evCount = MAP.events ? (Array.isArray(MAP.events) ? MAP.events.length : (MAP.events.rows ? MAP.events.rows.length : 2729)) : 2729;'
)

with open('/Users/kostenchuksergey/REPORTS/workbench-design/build_unified.py', 'w') as f:
    f.write(code)

print('Updated build_unified.py successfully')
