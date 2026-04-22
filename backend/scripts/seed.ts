import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';
import mongoose, { Types } from 'mongoose';

config();

const BCRYPT_SALT_ROUNDS = 10;
const AGENCY_SHARE_RATIO = 0.5;

type Stage = 'agreement' | 'earnest_money' | 'title_deed' | 'completed';
const STAGE_ORDER: Stage[] = [
  'agreement',
  'earnest_money',
  'title_deed',
  'completed',
];

interface SeedUser {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'agent';
}

interface SeededUser extends SeedUser {
  _id: Types.ObjectId;
}

interface TransactionTemplate {
  title: string;
  totalFee: number;
  stage: Stage;
  listingAgentEmail: string;
  sellingAgentEmail: string;
  // How many days ago the transaction was originally created, used to
  // generate a realistic spread of dates for the dashboard.
  daysAgo: number;
}

function readSeedUsers(): SeedUser[] {
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com'
  ).toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Admin User';

  return [
    {
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      role: 'admin',
    },
    {
      name: 'Alex Morgan',
      email: 'alex@company.com',
      password: 'agent123',
      role: 'agent',
    },
    {
      name: 'Priya Patel',
      email: 'priya@company.com',
      password: 'agent123',
      role: 'agent',
    },
    {
      name: 'James Carter',
      email: 'james@company.com',
      password: 'agent123',
      role: 'agent',
    },
  ];
}

const TRANSACTION_TEMPLATES: TransactionTemplate[] = [
  {
    title: 'Sunset Park 2BR sale',
    totalFee: 180_000,
    stage: 'completed',
    listingAgentEmail: 'alex@company.com',
    sellingAgentEmail: 'priya@company.com',
    daysAgo: 35,
  },
  {
    title: 'Downtown loft resale',
    totalFee: 240_000,
    stage: 'completed',
    listingAgentEmail: 'priya@company.com',
    sellingAgentEmail: 'james@company.com',
    daysAgo: 28,
  },
  {
    title: 'Harbor View penthouse',
    totalFee: 420_000,
    stage: 'title_deed',
    listingAgentEmail: 'james@company.com',
    sellingAgentEmail: 'alex@company.com',
    daysAgo: 21,
  },
  {
    title: 'Greenfield studio',
    totalFee: 95_000,
    stage: 'earnest_money',
    listingAgentEmail: 'alex@company.com',
    sellingAgentEmail: 'alex@company.com',
    daysAgo: 14,
  },
  {
    title: 'Maple Avenue family home',
    totalFee: 275_000,
    stage: 'earnest_money',
    listingAgentEmail: 'priya@company.com',
    sellingAgentEmail: 'alex@company.com',
    daysAgo: 10,
  },
  {
    title: 'Riverside duplex',
    totalFee: 310_000,
    stage: 'agreement',
    listingAgentEmail: 'james@company.com',
    sellingAgentEmail: 'priya@company.com',
    daysAgo: 7,
  },
  {
    title: 'Oak Hill cottage',
    totalFee: 165_000,
    stage: 'agreement',
    listingAgentEmail: 'alex@company.com',
    sellingAgentEmail: 'james@company.com',
    daysAgo: 4,
  },
  {
    title: 'Central Plaza office',
    totalFee: 540_000,
    stage: 'completed',
    listingAgentEmail: 'james@company.com',
    sellingAgentEmail: 'james@company.com',
    daysAgo: 48,
  },
  {
    title: 'Lakeview cottage',
    totalFee: 130_000,
    stage: 'title_deed',
    listingAgentEmail: 'priya@company.com',
    sellingAgentEmail: 'james@company.com',
    daysAgo: 18,
  },
  {
    title: 'Hillcrest 3BR villa',
    totalFee: 385_000,
    stage: 'earnest_money',
    listingAgentEmail: 'priya@company.com',
    sellingAgentEmail: 'priya@company.com',
    daysAgo: 12,
  },
  {
    title: 'Bayside apartment',
    totalFee: 210_000,
    stage: 'agreement',
    listingAgentEmail: 'alex@company.com',
    sellingAgentEmail: 'priya@company.com',
    daysAgo: 2,
  },
  {
    title: 'Cedar Grove townhouse',
    totalFee: 295_000,
    stage: 'completed',
    listingAgentEmail: 'alex@company.com',
    sellingAgentEmail: 'james@company.com',
    daysAgo: 60,
  },
];

function wantsWipe(): boolean {
  return (
    process.env.SEED_WIPE === 'true' || process.argv.includes('--wipe')
  );
}

async function wipeCollections(
  db: mongoose.mongo.Db,
): Promise<void> {
  const users = await db.collection('users').deleteMany({});
  const transactions = await db.collection('transactions').deleteMany({});
  console.log(
    `Wiped: users=${users.deletedCount}, transactions=${transactions.deletedCount}`,
  );
}

async function upsertUsers(
  db: mongoose.mongo.Db,
): Promise<Map<string, SeededUser>> {
  const collection = db.collection('users');
  const byEmail = new Map<string, SeededUser>();

  let insertedCount = 0;
  let skippedCount = 0;

  for (const seed of readSeedUsers()) {
    const existing = await collection.findOne<{
      _id: Types.ObjectId;
      email: string;
    }>({ email: seed.email });

    if (existing) {
      skippedCount += 1;
      byEmail.set(seed.email, { ...seed, _id: existing._id });
      console.log(`  · skipped ${seed.email} (already exists)`);
      continue;
    }

    const hashed = await bcrypt.hash(seed.password, BCRYPT_SALT_ROUNDS);
    const now = new Date();
    const result = await collection.insertOne({
      name: seed.name,
      email: seed.email,
      password: hashed,
      role: seed.role,
      createdAt: now,
      updatedAt: now,
    });
    insertedCount += 1;
    byEmail.set(seed.email, { ...seed, _id: result.insertedId });
    console.log(
      `  + ${seed.role.padEnd(5)} ${seed.email.padEnd(24)} (password: ${seed.password})`,
    );
  }

  console.log(
    `\nUsers finished. Inserted: ${insertedCount}, skipped: ${skippedCount}`,
  );
  return byEmail;
}

function calculateBreakdown(
  totalFee: number,
  listingId: Types.ObjectId,
  sellingId: Types.ObjectId,
): {
  companyCut: number;
  listingAgentCut: number;
  sellingAgentCut: number;
} {
  const companyCut = totalFee * AGENCY_SHARE_RATIO;
  const agentPool = totalFee - companyCut;
  if (listingId.equals(sellingId)) {
    return { companyCut, listingAgentCut: agentPool, sellingAgentCut: 0 };
  }
  const half = agentPool / 2;
  return { companyCut, listingAgentCut: half, sellingAgentCut: half };
}

function buildStageHistory(
  targetStage: Stage,
  createdAt: Date,
  actorId: Types.ObjectId,
): Array<{ stage: Stage; changedAt: Date; changedBy: Types.ObjectId }> {
  const targetIdx = STAGE_ORDER.indexOf(targetStage);
  const history: Array<{
    stage: Stage;
    changedAt: Date;
    changedBy: Types.ObjectId;
  }> = [];
  // Every subsequent stage happens ~2 days after the previous one.
  const stepMs = 2 * 24 * 60 * 60 * 1000;
  for (let i = 0; i <= targetIdx; i++) {
    history.push({
      stage: STAGE_ORDER[i],
      changedAt: new Date(createdAt.getTime() + i * stepMs),
      changedBy: actorId,
    });
  }
  return history;
}

async function seedTransactions(
  db: mongoose.mongo.Db,
  usersByEmail: Map<string, SeededUser>,
): Promise<void> {
  const collection = db.collection('transactions');
  const existingCount = await collection.countDocuments({});
  if (existingCount > 0 && !wantsWipe()) {
    console.log(
      `\nTransactions collection already has ${existingCount} records; skipping. ` +
        `Run with --wipe (or SEED_WIPE=true) to reset.`,
    );
    return;
  }

  let insertedCount = 0;
  const now = Date.now();

  for (const template of TRANSACTION_TEMPLATES) {
    const listing = usersByEmail.get(template.listingAgentEmail);
    const selling = usersByEmail.get(template.sellingAgentEmail);
    if (!listing || !selling) {
      console.warn(
        `  ! skipping "${template.title}": agent(s) not seeded`,
      );
      continue;
    }

    const createdAt = new Date(now - template.daysAgo * 24 * 60 * 60 * 1000);
    const stageHistory = buildStageHistory(
      template.stage,
      createdAt,
      listing._id,
    );
    const updatedAt = stageHistory[stageHistory.length - 1].changedAt;
    const breakdown =
      template.stage === 'completed'
        ? calculateBreakdown(template.totalFee, listing._id, selling._id)
        : undefined;

    await collection.insertOne({
      title: template.title,
      stage: template.stage,
      totalFee: template.totalFee,
      listingAgent: listing._id,
      sellingAgent: selling._id,
      stageHistory,
      ...(breakdown ? { financialBreakdown: breakdown } : {}),
      createdAt,
      updatedAt,
    });
    insertedCount += 1;
    console.log(
      `  + [${template.stage.padEnd(13)}] ${template.title} ` +
        `(${template.totalFee.toLocaleString('en-GB')} TRY)`,
    );
  }

  console.log(`\nTransactions finished. Inserted: ${insertedCount}`);
}

async function run(): Promise<void> {
  // Guard against accidentally seeding the production database with the
  // well-known default credentials. Must be bypassed explicitly.
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_SEED_IN_PRODUCTION !== 'true'
  ) {
    console.error(
      'Refusing to seed with NODE_ENV=production. Set ALLOW_SEED_IN_PRODUCTION=true if you really mean it.',
    );
    process.exit(1);
  }

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

  if (wantsWipe()) {
    await wipeCollections(db);
  }

  const users = await upsertUsers(db);
  await seedTransactions(db, users);

  await mongoose.disconnect();
}

void run().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
