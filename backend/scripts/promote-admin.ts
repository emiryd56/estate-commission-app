import { config } from 'dotenv';
import mongoose from 'mongoose';

config();

async function run(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx ts-node scripts/promote-admin.ts <email>');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not defined');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Failed to access mongoose.connection.db');
  }
  const result = await db.collection('users').updateOne(
    { email: email.toLowerCase().trim() },
    { $set: { role: 'admin' } },
  );

  if (result.matchedCount === 0) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  console.log(`Promoted ${email} to admin`);
  await mongoose.disconnect();
}

void run();
