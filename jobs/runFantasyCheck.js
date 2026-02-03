// Load environment variables first
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const checkFantasyLeagues = require('./checkFantasyLeagues');
const db = require('../bot/utils/firebase');

checkFantasyLeagues(db)
  .then(() => console.log('🎯 Finished checking leagues.'))
  .catch(err => console.error('❌ Fantasy check failed:', err));
