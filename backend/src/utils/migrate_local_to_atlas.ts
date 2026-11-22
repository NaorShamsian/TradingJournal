/**
 * Copies every collection from LOCAL_MONGO_URI to MONGO_URI (e.g. local -> Atlas).
 * Documents keep their _id; ones that already exist in the target are skipped,
 * so it is safe to run more than once.
 *
 *   npm run migrate
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const source = process.env.LOCAL_MONGO_URI;
const target = process.env.MONGO_URI;

const main = async () => {
  if (!source || !target) throw new Error('LOCAL_MONGO_URI and MONGO_URI must both be set in backend/.env');
  if (target.includes('<db_password>')) throw new Error('Replace <db_password> in MONGO_URI with your Atlas password first.');
  if (source === target) throw new Error('LOCAL_MONGO_URI and MONGO_URI are identical — nothing to migrate.');

  const src = await mongoose.createConnection(source).asPromise();
  const dst = await mongoose.createConnection(target).asPromise();
  console.log(`Source: ${src.host}/${src.name}  ->  Target: ${dst.host}/${dst.name}`);

  const collections = await src.db!.listCollections().toArray();
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    const docs = await src.db!.collection(name).find({}).toArray();
    if (docs.length === 0) {
      console.log(`  ${name}: empty, skipped`);
      continue;
    }
    const ops = docs.map((doc) => ({
      updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true },
    }));
    const res = await dst.db!.collection(name).bulkWrite(ops, { ordered: false });
    console.log(`  ${name}: ${res.upsertedCount} copied, ${docs.length - res.upsertedCount} already existed`);
  }

  await src.close();
  await dst.close();
  console.log('Migration complete.');
};

main().catch((err) => {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
});
