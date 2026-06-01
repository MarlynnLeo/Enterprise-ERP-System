/**
 * Backward-compatible API entry.
 *
 * Keep existing imports working, but route all business API exports through
 * the canonical '@/api' entry.
 */

export { api, fastApi } from './axiosInstance';
export { default } from './axiosInstance';
export * from '../api';
