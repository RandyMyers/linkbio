const Event = require('../models/Event');
const { classifyReferrer } = require('../lib/referrerSource');

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function pctChange(current, previous) {
  if (!previous) return current > 0 ? '+100%' : '0%';
  const delta = ((current - previous) / previous) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

function ctrPercent(views, clicks) {
  return views > 0 ? Number(((clicks / views) * 100).toFixed(1)) : 0;
}

function mapDailySeries(rows, field = 'count') {
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekly = rows.map((row) => {
    const d = new Date(`${row._id}T12:00:00Z`);
    return {
      label: dayLabels[d.getUTCDay()],
      date: row._id,
      value: row[field] ?? row.count ?? 0,
    };
  });
  const maxWeekly = Math.max(1, ...weekly.map((d) => d.value));
  return { weekly, maxWeekly };
}

function bucketReferrers(referrerRows) {
  const map = new Map();
  for (const row of referrerRows) {
    const source = classifyReferrer(row._id);
    map.set(source, (map.get(source) || 0) + row.count);
  }
  const total = [...map.values()].reduce((s, n) => s + n, 0) || 1;
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => ({
      source,
      count,
      pct: Math.round((count / total) * 100),
    }));
}

async function summaryForProfile(profileId, rangeDays = 7) {
  const since = daysAgo(rangeDays);
  const prevSince = daysAgo(rangeDays * 2);
  const prevUntil = since;

  const baseMatch = { profileId, createdAt: { $gte: since } };
  const prevMatch = { profileId, createdAt: { $gte: prevSince, $lt: prevUntil } };

  const [
    views,
    clicks,
    uniqueVisitors,
    prevViews,
    prevClicks,
    prevUnique,
    topLinks,
    deviceAgg,
    countryAgg,
    dailyClicks,
    dailyViews,
    referrerAgg,
  ] = await Promise.all([
    Event.countDocuments({ ...baseMatch, type: 'view' }),
    Event.countDocuments({ ...baseMatch, type: 'click' }),
    Event.distinct('visitorId', { ...baseMatch, visitorId: { $ne: '' } }).then((r) => r.length),
    Event.countDocuments({ ...prevMatch, type: 'view' }),
    Event.countDocuments({ ...prevMatch, type: 'click' }),
    Event.distinct('visitorId', { ...prevMatch, visitorId: { $ne: '' } }).then((r) => r.length),
    Event.aggregate([
      { $match: { profileId, type: 'click', createdAt: { $gte: since }, url: { $ne: '' } } },
      { $group: { _id: '$url', count: { $sum: 1 }, label: { $last: '$label' }, blockId: { $last: '$blockId' } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    Event.aggregate([
      { $match: { ...baseMatch, type: 'view' } },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $regexMatch: { input: '$device', regex: /mobile/i } }, then: 'Mobile' },
                { case: { $regexMatch: { input: '$device', regex: /tablet/i } }, then: 'Tablet' },
              ],
              default: 'Desktop',
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    Event.aggregate([
      { $match: { ...baseMatch, country: { $ne: '' } } },
      { $group: { _id: '$country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    Event.aggregate([
      { $match: { profileId, type: 'click', createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Event.aggregate([
      { $match: { profileId, type: 'view', createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Event.aggregate([
      { $match: { ...baseMatch, type: 'view' } },
      { $group: { _id: '$referrer', count: { $sum: 1 } } },
    ]),
  ]);

  const ctr = ctrPercent(views, clicks);
  const prevCtr = ctrPercent(prevViews, prevClicks);

  const topLinksMapped = topLinks.map((row) => ({
    url: row._id,
    title: row.label || row._id,
    blockId: row.blockId || '',
    clicks: row.count,
    ctr: views > 0 ? Number(((row.count / views) * 100).toFixed(1)) : 0,
  }));
  const maxClicks = Math.max(1, ...topLinksMapped.map((l) => l.clicks));

  const deviceTotal = deviceAgg.reduce((s, d) => s + d.count, 0) || 1;
  const devices = ['Mobile', 'Desktop', 'Tablet'].map((label) => {
    const row = deviceAgg.find((d) => d._id === label);
    const count = row?.count || 0;
    return { label, count, pct: Math.round((count / deviceTotal) * 100) };
  });

  const countryTotal = countryAgg.reduce((s, c) => s + c.count, 0) || 1;
  const topCountries = countryAgg.map((row) => ({
    code: row._id,
    count: row.count,
    pct: Math.round((row.count / countryTotal) * 100),
  }));

  const { weekly, maxWeekly } = mapDailySeries(dailyClicks);
  const { weekly: weeklyViews, maxWeekly: maxWeeklyViews } = mapDailySeries(dailyViews);

  const referrers = bucketReferrers(referrerAgg);
  const maxReferrer = Math.max(1, ...referrers.map((r) => r.count));

  return {
    rangeDays,
    views,
    clicks,
    ctr,
    unique: uniqueVisitors,
    revenue: 0,
    countries: countryAgg.length,
    trends: {
      views: pctChange(views, prevViews),
      clicks: pctChange(clicks, prevClicks),
      ctr: `${ctr >= prevCtr ? '+' : ''}${(ctr - prevCtr).toFixed(1)}pt`,
      unique: pctChange(uniqueVisitors, prevUnique),
    },
    topLinks: topLinksMapped,
    maxClicks,
    devices,
    topCountries,
    maxCountry: Math.max(1, ...topCountries.map((c) => c.count)),
    referrers,
    maxReferrer,
    weekly,
    maxWeekly,
    weeklyViews,
    maxWeeklyViews,
  };
}

async function clicksForProfile(profileId, rangeDays = 7) {
  const since = daysAgo(rangeDays);
  const rows = await Event.aggregate([
    { $match: { profileId, type: 'click', createdAt: { $gte: since } } },
    {
      $group: {
        _id: { url: '$url', label: '$label', blockId: '$blockId' },
        clicks: { $sum: 1 },
      },
    },
    { $sort: { clicks: -1 } },
    { $limit: 50 },
  ]);

  const views = await Event.countDocuments({ profileId, type: 'view', createdAt: { $gte: since } });

  return {
    rangeDays,
    views,
    links: rows.map((r) => ({
      url: r._id.url || '',
      label: r._id.label || r._id.url || 'Link',
      blockId: r._id.blockId || '',
      clicks: r.clicks,
      ctr: views > 0 ? Number(((r.clicks / views) * 100).toFixed(1)) : 0,
    })),
  };
}

function summaryToCsv(data) {
  const lines = [
    'metric,value',
    `views,${data.views}`,
    `clicks,${data.clicks}`,
    `ctr,${data.ctr}`,
    `unique,${data.unique}`,
    '',
    'link,clicks,ctr',
    ...(data.topLinks || []).map(
      (l) =>
        `"${String(l.title || l.label).replace(/"/g, '""')}",${l.clicks},${l.ctr ?? ''}`,
    ),
    '',
    'country,code,clicks,pct',
    ...(data.topCountries || []).map(
      (c) => `"${c.code}",${c.code},${c.count},${c.pct}`,
    ),
    '',
    'source,visits,pct',
    ...(data.referrers || []).map((r) => `"${r.source}",${r.count},${r.pct}`),
  ];
  return lines.join('\n');
}

module.exports = { summaryForProfile, clicksForProfile, summaryToCsv };
