import { Schema, model, Document } from 'mongoose';

export interface ISyncStatus extends Document {
  status: 'running' | 'stopped' | 'mt5_offline' | 'error';
  lastSyncTime?: Date;
  lastSuccessfulSyncTime?: Date;
  importedCount: number;
  skippedDuplicates: number;
  lastError?: string;
  triggerManualSync: boolean;
  mt5AccountName?: string;
  mt5AccountNumber?: string;
  mt5BrokerServer?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SyncStatusSchema = new Schema<ISyncStatus>(
  {
    status: {
      type: String,
      enum: ['running', 'stopped', 'mt5_offline', 'error'],
      required: true,
      default: 'stopped'
    },
    lastSyncTime: { type: Date },
    lastSuccessfulSyncTime: { type: Date },
    importedCount: { type: Number, default: 0 },
    skippedDuplicates: { type: Number, default: 0 },
    lastError: { type: String },
    triggerManualSync: { type: Boolean, default: false },
    mt5AccountName: { type: String },
    mt5AccountNumber: { type: String },
    mt5BrokerServer: { type: String },
  },
  {
    timestamps: true,
  }
);

export default model<ISyncStatus>('SyncStatus', SyncStatusSchema);
