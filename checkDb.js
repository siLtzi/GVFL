const db = require('./bot/utils/firebase');

async function check() {
  const scoresSnap = await db.collectionGroup('scores').get();
  
  const users = {};
  scoresSnap.forEach(doc => {
    const data = doc.data();
    const path = doc.ref.path;
    const id = data.userId || 'unknown';
    
    console.log(path);
    console.log('  ', data.username, data.points, 'pts');
    console.log('   1st:', data.first, '2nd:', data.second, '3rd:', data.third);
    
    if (!users[id]) {
      users[id] = { username: data.username, points: 0, first: 0, second: 0, third: 0 };
    }
    users[id].points += data.points || 0;
    users[id].first += data.first || 0;
    users[id].second += data.second || 0;
    users[id].third += data.third || 0;
  });
  
  console.log('\n=== ALL-TIME TOTALS ===');
  Object.entries(users)
    .sort((a, b) => b[1].points - a[1].points)
    .forEach(([id, u]) => {
      console.log(`${u.username}: ${u.points} pts | 1st:${u.first} 2nd:${u.second} 3rd:${u.third}`);
    });
}

check().then(() => process.exit(0));
