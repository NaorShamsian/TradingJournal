import { Request, Response } from 'express';
import Settings from '../models/Settings';

// GET /api/settings
export const getSettings = async (req: Request, res: Response) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
      await settings.save();
    }
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ message: 'Error retrieving settings', error: error.message });
  }
};

// PUT /api/settings
export const updateSettings = async (req: Request, res: Response) => {
  try {
    const {
      defaultBalance,
      timezone,
      currency,
      strategies,
      sessions,
      riskPerTradePercent,
    } = req.body;

    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
    }

    if (defaultBalance !== undefined) settings.defaultBalance = defaultBalance;
    if (timezone !== undefined) settings.timezone = timezone;
    if (currency !== undefined) settings.currency = currency;
    if (strategies !== undefined) settings.strategies = strategies;
    if (sessions !== undefined) settings.sessions = sessions;
    if (riskPerTradePercent !== undefined) settings.riskPerTradePercent = riskPerTradePercent;

    await settings.save();
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating settings', error: error.message });
  }
};
