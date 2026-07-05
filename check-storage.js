// Storage monitoring utility
const fs = require('fs').promises;
const path = require('path');

async function checkStorageUsage() {
    try {
        const songsDbPath = path.join(__dirname, 'songs-db.json');
        const uploadsDir = path.join(__dirname, 'uploads');
        
        // Read songs database
        const songsData = JSON.parse(await fs.readFile(songsDbPath, 'utf8'));
        
        // Calculate total size
        let totalSize = 0;
        let songCount = 0;
        
        for (const song of songsData) {
            totalSize += song.size || 0;
            songCount++;
        }
        
        // Convert to readable format
        const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
        const totalSizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(3);
        const percentUsed = ((totalSize / (1024 * 1024 * 1024)) * 100).toFixed(1);
        
        console.log(`📊 Storage Usage Report:`);
        console.log(`🎵 Songs: ${songCount}`);
        console.log(`💾 Used: ${totalSizeMB} MB (${totalSizeGB} GB)`);
        console.log(`📈 Capacity: ${percentUsed}% of 25GB`);
        console.log(`🆓 Available: ${(25000 - parseFloat(totalSizeMB)).toFixed(2)} MB`);
        
        if (parseFloat(percentUsed) > 80) {
            console.log(`⚠️  Warning: Storage is ${percentUsed}% full!`);
        }
        
        return {
            songCount,
            totalSizeMB: parseFloat(totalSizeMB),
            percentUsed: parseFloat(percentUsed),
            availableMB: 25000 - parseFloat(totalSizeMB)
        };
        
    } catch (error) {
        console.error('Error checking storage:', error.message);
    }
}

// Run if called directly
if (require.main === module) {
    checkStorageUsage();
}

module.exports = { checkStorageUsage };