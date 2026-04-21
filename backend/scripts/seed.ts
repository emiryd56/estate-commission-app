import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';
import mongoose from 'mongoose';

config();

const BCRYPT_SALT_ROUNDS = 10;

interface SeedUser {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'agent';
}

function readSeedUsers(): SeedUser[] {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@firma.com').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Admin User';

  return [
    { name: adminName, email: adminEmail, password: adminPassword, role: 'admin' },
    { name: 'Ayşe Demir', email: 'ayse@firma.com', password: 'agent123', role: 'agent' },
    { name: 'Mehmet Kara', email: 'mehmet@firma.com', password: 'agent123', role: 'agent' },
    { name: 'Zeynep Çelik', email: 'zeynep@firma.com', password: 'agent123', role: 'agent' },
  ];
}

async function run(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not defined in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Failed to access mongoose.connection.db');
  }
  const users = db.collection('users');

  let insertedCount = 0;
  let skippedCount = 0;

  for (const seed of readSeedUsers()) {
    const existing = await users.findOne({ email: seed.email });
    if (existing) {
      skippedCount += 1;
      console.log(`  · skipped ${seed.email} (already exists)`);
      continue;
    }

    const hashed = await bcrypt.hash(seed.password, BCRYPT_SALT_ROUNDS);
    const now = new Date();
    await users.insertOne({
      name: seed.name,
      email: seed.email,
      password: hashed,
      role: seed.role,
      createdAt: now,
      updatedAt: now,
    });
    insertedCount += 1;
    console.log(
      `  + ${seed.role.padEnd(5)} ${seed.email.padEnd(24)} (password: ${seed.password})`,
    );
  }

  console.log(`\nSeed finished. Inserted: ${insertedCount}, skipped: ${skippedCount}`);
  await mongoose.disconnect();
}

void run().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
