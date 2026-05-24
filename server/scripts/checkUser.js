require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await mongoose.connection.db
    .collection('users')
    .find({}, { projection: { email: 1, emailNotifications: 1 } })
    .toArray();
  console.log(JSON.stringify(users, null, 2));
  process.exit(0);
}
main().catch(console.error);
