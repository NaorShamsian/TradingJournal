import { Schema, model, Document } from 'mongoose';

// Candles around a closed trade never change, so they are cached here. This
// keeps trade charts available even when the MT5 terminal is closed.
export interface ICandleCache extends Document {
  key: string;
  symbol: string;
  timeframe: string;
  from: number;
  to: number;
  digits: number;
  candles: { time: number; open: number; high: number; low: number; close: number }[];
  createdAt: Date;
}

const CandleCacheSchema = new Schema<ICandleCache>(
  {
    key: { type: String, required: true, unique: true },
    symbol: { type: String, required: true },
    timeframe: { type: String, required: true },
    from: { type: Number, required: true },
    to: { type: Number, required: true },
    digits: { type: Number, default: 5 },
    candles: [{ _id: false, time: Number, open: Number, high: Number, low: Number, close: Number }],
  },
  { timestamps: true }
);

export default model<ICandleCache>('CandleCache', CandleCacheSchema);
