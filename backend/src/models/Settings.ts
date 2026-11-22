import { Schema, model, Document } from 'mongoose';

export interface ISessionDefinition {
  name: 'Asia' | 'London' | 'New York' | 'Other';
  startHour: number; // e.g. 0 to 23
  endHour: number;
}

export interface ISettings extends Document {
  defaultBalance: number;
  timezone: string;
  currency: string;
  strategies: string[];
  sessions: ISessionDefinition[];
  riskPerTradePercent: number;
  mergeTrades: boolean;
  mergeWindowMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

const SettingsSchema = new Schema<ISettings>(
  {
    defaultBalance: { type: Number, required: true, default: 10000 },
    timezone: { type: String, required: true, default: 'UTC' },
    currency: { type: String, required: true, default: 'USD' },
    strategies: {
      type: [String],
      default: ['Breakout', 'Trend Following', 'Mean Reversion', 'Support/Resistance', 'ICT/SMC', 'Scalping']
    },
    sessions: {
      type: [
        {
          name: { type: String, enum: ['Asia', 'London', 'New York', 'Other'], required: true },
          startHour: { type: Number, required: true },
          endHour: { type: Number, required: true },
        }
      ],
      default: [
        { name: 'Asia', startHour: 0, endHour: 8 },
        { name: 'London', startHour: 8, endHour: 16 },
        { name: 'New York', startHour: 13, endHour: 21 },
      ]
    },
    riskPerTradePercent: { type: Number, required: true, default: 1.0 },
    // Smart grouping: merge same-symbol, same-direction positions that overlap
    // or open within `mergeWindowMinutes` of each other into one trade.
    mergeTrades: { type: Boolean, default: true },
    mergeWindowMinutes: { type: Number, default: 5, min: 0, max: 1440 },
  },
  {
    timestamps: true,
  }
);

export default model<ISettings>('Settings', SettingsSchema);
