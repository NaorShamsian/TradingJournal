import { Schema, model, Document } from 'mongoose';

// Non-trading balance changes from MT5 (deposits, withdrawals, credits,
// corrections). Together with closed trades they let the journal rebuild the
// real account balance at any point in time.
export interface IBalanceOperation extends Document {
  accountNumber: string;
  mt5DealId: string;
  time: Date; // MT5 server time, same frame as Trade.closeTime
  amount: number; // positive = deposit, negative = withdrawal
  type: number; // MT5 deal type (2 = balance)
  comment?: string;
}

const BalanceOperationSchema = new Schema<IBalanceOperation>(
  {
    accountNumber: { type: String, required: true, index: true },
    mt5DealId: { type: String, required: true },
    time: { type: Date, required: true },
    amount: { type: Number, required: true },
    type: { type: Number, default: 2 },
    comment: { type: String, default: '' },
  },
  { timestamps: true }
);

BalanceOperationSchema.index({ accountNumber: 1, mt5DealId: 1 }, { unique: true });

export default model<IBalanceOperation>('BalanceOperation', BalanceOperationSchema);
