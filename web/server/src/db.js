'use strict';

const fs = require('fs');

/*
 * db.js - Firebase Firestore with automatic in-memory fallback.
 */

const localStore = new Map();

const state = {
  available: true,
  isCloud: false,
  reason: 'in-memory storage',
  firestore: null
};

async function connect() {
  const path = require('path');
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH 
    ? path.resolve(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
    : null;
  
  if (!serviceAccountPath || !fs.existsSync(serviceAccountPath)) {
    state.available = true;
    state.isCloud = false;
    state.reason = 'in-memory storage (local)';
    return state;
  }

  try {
    const connectPromise = new Promise((resolve) => {
      try {
        const serviceAccount = require(serviceAccountPath);
        const { initializeApp, cert, getApps } = require('firebase-admin/app');
        const { getFirestore } = require('firebase-admin/firestore');
        
        if (getApps().length === 0) {
          initializeApp({
            credential: cert(serviceAccount)
          });
        }
        
        const dbInstance = getFirestore();
        /* Probe if Cloud Firestore API is actually enabled in the GCP project */
        dbInstance.collection('programs').limit(1).get()
          .then(() => {
            state.firestore = dbInstance;
            state.isCloud = true;
            state.available = true;
            state.reason = 'connected to Firebase';
            resolve(state);
          })
          .catch((err) => {
            console.warn('Firebase Firestore unavailable (' + err.message + '). Using local in-memory storage.');
            state.firestore = null;
            state.isCloud = false;
            state.available = true;
            state.reason = 'in-memory storage (local)';
            resolve(state);
          });
      } catch (err) {
        state.isCloud = false;
        state.available = true;
        state.reason = 'in-memory storage (local)';
        resolve(state);
      }
    });

    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        if (!state.isCloud) {
          state.isCloud = false;
          state.available = true;
          state.reason = 'in-memory storage (local)';
          resolve(state);
        }
      }, 2500);
    });

    await Promise.race([connectPromise, timeoutPromise]);
  } catch (err) {
    state.isCloud = false;
    state.available = true;
    state.reason = 'in-memory storage (local)';
  }
  
  return state;
}

module.exports = { state, connect, localStore };
