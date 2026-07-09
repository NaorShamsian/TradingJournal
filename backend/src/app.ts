import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import tradesRouter from './routes/trades';
import statsRouter from './routes/stats';
import syncRouter from './routes/sync';
import settingsRouter from './routes/settings';
import accountsRouter from './routes/accounts';

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/trades', tradesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/accounts', accountsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

export default app;
