import app from './app';
import { connectDB } from './config/db';
import { startSyncScheduler } from './services/mt5Sync';

const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startSyncScheduler();
  });
}).catch((error) => {
  console.error('Failed to start server due to DB connection error:', error);
});
