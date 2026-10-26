(function(root) {
  const data = root.CUHK_CAMPUS_GUIDE || (typeof require !== 'undefined' ? require('../data/campus_guide.js') : null);
  const normalize = data.normalize;
  const nameOf = item => item.name || (item.title === item.building.name ? item.title :
    `${item.building.name} ${item.title || data.categories[item.category].label}`);
  function facility(item, at = new Date()) {
    const category = data.categories[item.category];
    const allowed = item.navigationEnabled !== false && !!item.webCoord;
    return { ...item, kind: 'facility', name: nameOf(item), hours: data.hoursFor(item, at),
      icon: item.icon || category.icon, label: category.label, navigable: allowed,
      status: item.statusLabel || (!allowed ? item.infoOnlyText || (item.webCoord ? '仅供查阅，暂不提供导航' : '坐标待核实') : '导航至所在建筑') };
  }
  function facilityMatches(query, at) {
    const text = normalize(query);
    return data.items.flatMap(raw => {
      const item = facility(raw, at);
      if (!text) return [item];
      const building = normalize([item.building.name, item.building.english, item.building.code,
        ...(item.buildingAliases || [])].filter(Boolean).join(' '));
      const matchesBuilding = value => value.trim().split(/\s+/).filter(Boolean).every(word => building.includes(word));
      const aliases = data.categories[item.category].aliases.filter(alias => !/24|通宵/.test(alias) || /24/.test(item.hours))
        .concat(item.aliases || [], item.name, item.title || '', item.english || '').filter(Boolean).map(normalize);
      const matched = aliases.some(alias => text.includes(alias) && matchesBuilding(text.replace(alias, '')));
      return matched || matchesBuilding(text) || normalize([item.name, item.english, ...(item.aliases || [])].join(' ')).includes(text) ? [item] : [];
    });
  }
  function search(query, category = 'all', stops = [], at = new Date()) {
    const text = normalize(query), matches = value => !text || text.split(/\s+/).every(word => normalize(value).includes(word));
    const other = [];
    if (category === 'all' || category === 'building') data.buildings.forEach(item => {
      if (matches([item.name, item.shortName, ...(item.aliases || [])].join(' '))) other.push({ ...item,
        kind: 'building', label: item.shortName, icon: 'book', navigable: !!item.webCoord && !item.offCampus, status: !item.webCoord ? '坐标待核实' : item.offCampus ? '校外地点，不提供校园导航' : '' });
    });
    if (category === 'all' || category === 'dining') data.dining.forEach(item => {
      if (item.status === 'deleted') return;
      const exact = [item.name, ...(item.aliases || [])].some(alias => normalize(alias) === text);
      if (item.hidden && (!text || !exact)) return;
      if (matches([item.name, ...(item.aliases || [])].join(' '))) other.push({ ...item, kind: 'dining',
        label: '餐厅', icon: 'shop', hours: item.regular_hours || '', navigable: !!item.webCoord && !item.hidden,
        status: item.hidden ? item.temporary_closure && item.temporary_closure !== 'None' ? item.temporary_closure : '暂停营业' : '' });
    });
    if (category === 'all' || category === 'stop') stops.forEach(item => {
      if (matches(item.name + ' ' + item.id)) other.push({ ...item, kind: 'stop', label: '校巴站', icon: 'service', navigable: true });
    });
    const results = (category === 'all' || category === 'facility' ? facilityMatches(query, at) : []).concat(other);
    return results.sort((a, b) => (normalize(b.name) === text) - (normalize(a.name) === text));
  }
  function phone(value) {
    const number = String(value || '').replace(/\s/g, '');
    return /^[2-9]\d{7}$/.test(number) ? '+852' + number : /^\+852[2-9]\d{7}$/.test(number) ? number : '';
  }
  function safeUrl(value) {
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
  }
  const api = { facility, search, phone, safeUrl };
  root.CUHK_GUIDE_CORE = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
