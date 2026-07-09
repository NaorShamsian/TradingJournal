import { Schema, model, Document } from 'mongoose';

export interface IMT5Account extends Document {
  login: number;
  password?: string;
  server: string;
  path?: string;
  name?: string;
  isActive: boolean;
  defaultBalance: number;
  riskPerTradePercent: number;
  syncHistoryDepth: 'week' | 'month' | 'year' | 'all';
  createdAt: Date;
  updatedAt: Date;
}

const MT5AccountSchema = new Schema<IMT5Account>(
  {
    login: { type: Number, required: true, unique: true },
    password: { type: String, default: '' },
    server: { type: String, required: true },
    path: { type: String, default: '' },
    name: { type: String, default: '' },
    isActive: { type: Boolean, default: false },
    defaultBalance: { type: Number, default: 25000 },
    riskPerTradePercent: { type: Number, default: 1.0 },
    syncHistoryDepth: { type: String, enum: ['week', 'month', 'year', 'all'], default: 'all' },
  },
  {
    timestamps: true,
  }
);

export default model<IMT5Account>('MT5Account', MT5AccountSchema);
