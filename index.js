const express = require('express');
const path = require('path');
app.use(express.static(path.join(__dirname, 'frontend')));
const axios = require('axios');
const m3uParser = require('m3u-parser');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 7000;
const cache = new NodeCache({ stdTTL: 300 }); // cache 5 minutes

// Addon manifest
const manifest = {
    id: 'org.dynamic.m3u',
    version: '1.0.0',
    name: 'Dynamic M3U Streamer',
    description: 'Add any M3U URL and stream channels in Stremio',
    resources: ['stream', 'catalog'],
    types: ['channel'],
    catalogs: [
        {
            type: 'channel',
            id: 'dynamic-m3u',
            name: 'Dynamic M3U',
            extra: [
                { name: 'url', isRequired: true, description: 'M3U playlist URL' }
            ]
        }
    ]
};

// Parse M3U playlist
async function parseM3U(url) {
    const cached = cache.get(url);
    if (cached) return cached;

    const response = await axios.get(url);
    const playlist = m3uParser.parse(response.data);

    const streams = playlist.items
        .filter(item => item.type === 'track')
        .map(item => ({
            id: (item.tvg.id || item.name).replace(/\s+/g, '-').toLowerCase(),
            name: item.name,
            url: item.uri,
            type: 'live',
            poster: item.tvg.logo || '',
            epg: item.tvg.id || ''
        }));

    cache.set(url, streams);
    return streams;
}

// Manifest endpoint
app.get('/manifest.json', (req, res) => res.json(manifest));

// Catalog endpoint
app.get('/catalog', async (req, res) => {
    const m3uUrl = req.query.url;
    if (!m3uUrl) return res.status(400).send('Missing "url" parameter');

    try {
        const streams = await parseM3U(m3uUrl);
        const metas = streams.map(s => ({
            id: s.id,
            name: s.name,
            type: 'channel',
            poster: s.poster
        }));
        res.json({ metas });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error parsing M3U playlist');
    }
});

// Stream endpoint
app.get('/stream', async (req, res) => {
    const m3uUrl = req.query.url;
    const channelId = req.query.channelId;
    if (!m3uUrl || !channelId) return res.status(400).send('Missing parameters');

    try {
        const streams = await parseM3U(m3uUrl);
        const channel = streams.find(s => s.id === channelId);
        if (!channel) return res.status(404).send('Channel not found');

        res.json({ streams: [{ title: channel.name, url: channel.url, type: 'live', poster: channel.poster }] });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error fetching stream');
    }
});

app.listen(PORT, () => console.log(`Dynamic M3U Stremio addon running on port ${PORT}`));
