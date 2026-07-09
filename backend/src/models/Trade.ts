import { Schema, model, Document } from 'mongoose';

export interface ITrade extends Document {
  mt5DealId: string;
  mt5OrderId: string;
  positionId: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  openTime: Date;
  closeTime: Date;
  entryPrice: number;
  exitPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  commission: number;
  swap: number;
  netProfit: number;
  rr?: number;
  durationMinutes?: number;
  strategy?: string;
  session?: 'Asia' | 'London' | 'New York' | 'Other';
  emotion?: string;
  mistake?: boolean;
  mistakeTags?: string[];
  notes?: string;
  entryReason?: string;
  exitReason?: string;
  followedRules?: boolean;
  selfRating?: number;
  screenshotBeforeUrl?: string;
  screenshotAfterUrl?: string;
  screenshotBeforeScale?: number;
  screenshotAfterScale?: number;
  accountNumber: string;
  createdAt: Date;
  updatedAt: Date;
}

const TradeSchema = new Schema<ITrade>(
  {
    mt5DealId: { type: String, required: true, index: true },
    accountNumber: { type: String, required: true, index: true },
    mt5OrderId: { type: String, required: true },
    positionId: { type: String, required: true },
    symbol: { type: String, required: true, uppercase: true, index: true },
    type: { type: String, enum: ['BUY', 'SELL'], required: true },
    volume: { type: Number, required: true },
    openTime: { type: Date, required: true, index: true },
    closeTime: { type: Date, required: true, index: true },
    entryPrice: { type: Number, required: true },
    exitPrice: { type: Number, required: true },
    stopLoss: { type: Number },
    takeProfit: { type: Number },
    profit: { type: Number, required: true },
    commission: { type: Number, required: true },
    swap: { type: Number, required: true },
    netProfit: { type: Number, required: true },
    rr: { type: Number },
    durationMinutes: { type: Number },
    strategy: { type: String, default: 'Unassigned', index: true },
    session: { type: String, enum: ['Asia', 'London', 'New York', 'Other'], default: 'Other', index: true },
    emotion: { type: String },
    mistake: { type: Boolean, default: false },
    mistakeTags: { type: [String], default: [] },
    notes: { type: String },
    entryReason: { type: String },
    exitReason: { type: String },
    followedRules: { type: Boolean },
    selfRating: { type: Number, min: 1, max: 10 },
    screenshotBeforeUrl: { type: String },
    screenshotAfterUrl: { type: String },
    screenshotBeforeScale: { type: Number, default: 100 },
    screenshotAfterScale: { type: Number, default: 100 },
  },
  {
    timestamps: true,
  }
);

TradeSchema.index({ mt5DealId: 1, accountNumber: 1 }, { unique: true });

export default model<ITrade>('Trade', TradeSchema);
