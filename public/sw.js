// Service Worker for MusicJam PWA
const CACHE_NAME = 'musicjam-v2.0.0';
const STATIC_CACHE = 'musicjam-static-v2';
const DYNAMIC_CACHE = 'musicjam-dynamic-v2';

// Files to cache for offline functionality
const STATIC_ASSETS = [
    '/',
    '/css/style.css',
    '/css/room.css', 
    '/js/app.js',
    '/js/room.js',
    '/js/audio-player.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    // Add Google Fonts
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Network-first resources (always try network first)
const NETWORK_FIRST = [
    '/api/',
    '/socket.io/',
    '/uploads/'
];

// Cache-first resources (try cache first)
const CACHE_FIRST = [
    '/css/',
    '/js/',
    '/icons/',
    'https://fonts.googleapis.com/',
    'https://fonts.gstatic.com/'
];

// Install Service Worker
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('Service Worker: Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('Service Worker: Static assets cached');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('Service Worker: Failed to cache static assets', error);
            })
    );
});

// Activate Service Worker
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        // Delete old caches
                        if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                            console.log('Service Worker: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Activated');
                return self.clients.claim();
            })
    );
});

// Fetch Event - Handle network requests
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip chrome-extension requests
    if (url.protocol === 'chrome-extension:') return;

    // ── Pass through Cloudinary media entirely — never cache, never intercept ──
    // Audio/video files are too large for SW caching and must bypass CSP restrictions
    if (url.hostname.includes('cloudinary.com')) return;

    // ── Pass through socket.io entirely ──
    if (url.pathname.startsWith('/socket.io/')) return;

    // Handle different caching strategies based on URL patterns
    if (isNetworkFirst(request.url)) {
        event.respondWith(networkFirstStrategy(request));
    } else if (isCacheFirst(request.url)) {
        event.respondWith(cacheFirstStrategy(request));
    } else {
        event.respondWith(staleWhileRevalidateStrategy(request));
    }
});

// Check if URL should use network-first strategy
function isNetworkFirst(url) {
    return NETWORK_FIRST.some(pattern => url.includes(pattern));
}

// Check if URL should use cache-first strategy  
function isCacheFirst(url) {
    return CACHE_FIRST.some(pattern => url.includes(pattern));
}

// Network-first strategy (for API calls, real-time data)
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('Network failed, trying cache:', request.url);
        
        // Fall back to cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // If no cache, return offline page for navigation requests
        if (request.destination === 'document') {
            return caches.match('/offline.html') || new Response(
                'You are offline. Please check your internet connection.',
                { status: 503, statusText: 'Service Unavailable' }
            );
        }
        
        throw error;
    }
}

// Cache-first strategy (for static assets)
async function cacheFirstStrategy(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        // Update cache in background
        fetch(request)
            .then(networkResponse => {
                if (networkResponse.ok) {
                    caches.open(STATIC_CACHE)
                        .then(cache => cache.put(request, networkResponse));
                }
            })
            .catch(() => {
                // Ignore network errors in background update
            });
        
        return cachedResponse;
    }
    
    // Not in cache, fetch from network
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            try {
                const cache = await caches.open(STATIC_CACHE);
                const responseClone = networkResponse.clone();
                await cache.put(request, responseClone);
            } catch (cacheError) {
                console.warn('Failed to cache response:', cacheError);
            }
        }
        
        return networkResponse;
    } catch (error) {
        console.warn('Failed to fetch resource:', request.url, error.message);
        // Return a basic response for failed requests
        return new Response('Network error', { status: 503, statusText: 'Service Unavailable' });
    }
}

// Stale-while-revalidate strategy (for general content)
async function staleWhileRevalidateStrategy(request) {
    const cachedResponse = await caches.match(request);
    
    const fetchPromise = fetch(request)
        .then(async networkResponse => {
            if (networkResponse.ok) {
                try {
                    const cache = await caches.open(DYNAMIC_CACHE);
                    // Clone before using the response
                    const responseClone = networkResponse.clone();
                    await cache.put(request, responseClone);
                } catch (error) {
                    console.warn('Failed to cache response:', error);
                }
            }
            return networkResponse;
        })
        .catch(() => {
            // Return cached version if network fails
            return cachedResponse;
        });
    
    // Return cached version immediately if available
    return cachedResponse || fetchPromise;
}

// Background Sync for offline actions
self.addEventListener('sync', event => {
    console.log('Service Worker: Background sync', event.tag);
    
    if (event.tag === 'queue-sync') {
        event.waitUntil(syncQueueActions());
    }
});

// Sync queued actions when back online
async function syncQueueActions() {
    // This would sync any queued music additions, room creations, etc.
    // when the user comes back online
    console.log('Syncing offline actions...');
    
    // Implementation would depend on your offline storage strategy
    // Could use IndexedDB to store offline actions and replay them
}

// Push notifications (for room updates when app is closed)
self.addEventListener('push', event => {
    console.log('Service Worker: Push received');
    
    let options = {
        body: 'New activity in your music room',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-96.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'open-room',
                title: 'Open Room',
                icon: '/icons/icon-96.png'
            },
            {
                action: 'dismiss',
                title: 'Dismiss'
            }
        ]
    };
    
    if (event.data) {
        try {
            const data = event.data.json();
            options.body = data.message || options.body;
            options.data.roomCode = data.roomCode;
        } catch (error) {
            console.error('Error parsing push data:', error);
        }
    }
    
    event.waitUntil(
        self.registration.showNotification('MusicJam', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
    console.log('Service Worker: Notification clicked');
    
    event.notification.close();
    
    if (event.action === 'open-room') {
        const roomCode = event.notification.data.roomCode;
        const url = roomCode ? `/room/${roomCode}` : '/';
        
        event.waitUntil(
            clients.openWindow(url)
        );
    } else if (event.action === 'dismiss') {
        // Just close the notification
        return;
    } else {
        // Default action - open the app
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Message handling (for communication with main app)
self.addEventListener('message', event => {
    console.log('Service Worker: Message received', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    // Handle other message types as needed
    switch (event.data?.type) {
        case 'CACHE_MUSIC':
            // Pre-cache music files for offline playback
            event.waitUntil(cacheMusicFile(event.data.url));
            break;
            
        case 'CLEAR_CACHE':
            // Clear specific cache
            event.waitUntil(clearCache(event.data.cacheName));
            break;
    }
});

// Cache music files for offline playback
async function cacheMusicFile(url) {
    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        await cache.add(url);
        console.log('Music file cached:', url);
    } catch (error) {
        console.error('Failed to cache music file:', error);
    }
}

// Clear specific cache
async function clearCache(cacheName) {
    try {
        await caches.delete(cacheName || DYNAMIC_CACHE);
        console.log('Cache cleared:', cacheName);
    } catch (error) {
        console.error('Failed to clear cache:', error);
    }
}

// Periodic background sync (if supported)
if ('periodicSync' in self.registration) {
    self.addEventListener('periodicsync', event => {
        if (event.tag === 'room-sync') {
            event.waitUntil(periodicRoomSync());
        }
    });
}

async function periodicRoomSync() {
    // Sync room state periodically in background
    console.log('Periodic room sync...');
    // Implementation would sync critical room state
}