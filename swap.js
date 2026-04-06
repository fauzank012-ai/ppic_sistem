const fs = require('fs');

const content = fs.readFileSync('src/pages/KombinasiSliting.tsx', 'utf8');

const coilStart = content.indexOf('{/* Coil Input Table */}');
const mainStart = content.indexOf('{/* Main Table */}');
const todayStart = content.indexOf('{/* Today\'s Summary Table */}');

if (coilStart !== -1 && mainStart !== -1 && todayStart !== -1) {
    const coilBlock = content.substring(coilStart, mainStart);
    const mainBlock = content.substring(mainStart, todayStart);
    
    const newContent = content.substring(0, coilStart) + mainBlock + coilBlock + content.substring(todayStart);
    
    fs.writeFileSync('src/pages/KombinasiSliting.tsx', newContent);
    console.log("Swapped successfully");
} else {
    console.log("Could not find blocks");
}
