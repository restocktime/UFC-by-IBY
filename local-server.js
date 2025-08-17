const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Import API handlers
const demoHandler = require('./api/demo.js');
const healthHandler = require('./api/health.js');
const fightersHandler = require('./api/fighters.js');
const oddsHandler = require('./api/odds.js');
const predictionsHandler = require('./api/predictions.js');
const liveDataHandler = require('./api/live-data.js');
const espnLiveHandler = require('./api/espn-live.js');

const PORT = 3001;

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml'
};

function serveStaticFile(filePath, res) {
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>500 - Server Error</h1>');
            }
            return;
        }

        const ext = path.extname(filePath);
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Enable CORS for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    console.log(`${req.method} ${pathname}`);

    // API routes
    if (pathname.startsWith('/api/')) {
        try {
            // Create mock request/response objects that match Vercel's interface
            const mockReq = {
                ...req,
                query: parsedUrl.query,
                body: req.method === 'POST' ? await getRequestBody(req) : undefined
            };
            
            const mockRes = {
                setHeader: (name, value) => res.setHeader(name, value),
                status: (code) => {
                    mockRes._statusCode = code;
                    return mockRes;
                },
                json: (data) => {
                    res.writeHead(mockRes._statusCode || 200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(data));
                },
                end: () => res.end(),
                _statusCode: 200
            };

            // Route to appropriate handler
            switch (pathname) {
                case '/api/demo':
                    await demoHandler.default(mockReq, mockRes);
                    break;
                case '/api/health':
                    await healthHandler.default(mockReq, mockRes);
                    break;
                case '/api/fighters':
                    await fightersHandler.default(mockReq, mockRes);
                    break;
                case '/api/odds':
                    await oddsHandler.default(mockReq, mockRes);
                    break;
                case '/api/predictions':
                    await predictionsHandler.default(mockReq, mockRes);
                    break;
                case '/api/live-data':
                    await liveDataHandler.default(mockReq, mockRes);
                    break;
                case '/api/espn-live':
                    await espnLiveHandler.default(mockReq, mockRes);
                    break;
                default:
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'API endpoint not found' }));
            }
        } catch (error) {
            console.error('API Error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error', message: error.message }));
        }
        return;
    }

    // Static file serving
    let filePath;
    
    if (pathname === '/' || pathname === '/index.html') {
        filePath = path.join(__dirname, 'public', 'index.html');
    } else {
        // Try to serve from public directory first
        filePath = path.join(__dirname, 'public', pathname);
        
        // If not found in public, try root directory
        if (!fs.existsSync(filePath)) {
            filePath = path.join(__dirname, pathname);
        }
    }

    serveStaticFile(filePath, res);
});

// Helper function to get request body for POST requests
function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                resolve({});
            }
        });
        req.on('error', reject);
    });
}

server.listen(PORT, () => {
    console.log('🥊 UFC Prediction Platform - Local Development Server');
    console.log('='.repeat(50));
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`🔌 API: http://localhost:${PORT}/api/health`);
    console.log('='.repeat(50));
    console.log('Available endpoints:');
    console.log('  • /api/health - Health check');
    console.log('  • /api/demo - Demo endpoint');
    console.log('  • /api/fighters - Fighter data');
    console.log('  • /api/odds - Live odds');
    console.log('  • /api/predictions - AI predictions');
    console.log('  • /api/live-data - Live UFC data');
    console.log('  • /api/espn-live - ESPN integration');
    console.log('='.repeat(50));
    console.log('Press Ctrl+C to stop');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});