/**
 * Canonical frontend API entry.
 *
 * New code should import business API modules from '@/api'.
 */

export { api, fastApi } from '../services/axiosInstance';
export { default } from '../services/axiosInstance';

export * from './afterSales';
export * from './baseData';
export * from './bom';
export * from './common';
export * from './contract';
export * from './enhanced';
export * from './equipment';
export * from './finance';
export * from './hr';
export * from './inventory';
export * from './location';
export * from './material';
export * from './notification';
export * from './nonconformingProductApi';
export { default as nonconformingProductApi } from './nonconformingProductApi';
export * from './production';
export * from './print';
export * from './purchase';
export * from './quality';
export * from './sales';
export * from './supplier';
export * from './system';
export * from './technicalCommunication';
export * from './user';
export * from './workflow';
export * from './modules/business/equipmentMonitoring';
