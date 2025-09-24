// Simple console logger for Railway deployment
const logger = {
  info: (obj, msg) => {
    if (typeof obj === 'string') {
      console.log(`[INFO] ${obj}`);
    } else {
      console.log(`[INFO] ${msg || ''}`, obj);
    }
  },
  error: (obj, msg) => {
    if (typeof obj === 'string') {
      console.error(`[ERROR] ${obj}`);
    } else {
      console.error(`[ERROR] ${msg || ''}`, obj);
    }
  },
  warn: (obj, msg) => {
    if (typeof obj === 'string') {
      console.warn(`[WARN] ${obj}`);
    } else {
      console.warn(`[WARN] ${msg || ''}`, obj);
    }
  },
  debug: (obj, msg) => {
    if (typeof obj === 'string') {
      console.log(`[DEBUG] ${obj}`);
    } else {
      console.log(`[DEBUG] ${msg || ''}`, obj);
    }
  }
};

export default logger;


