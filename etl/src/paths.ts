import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAW_DIR = path.join(REPO_ROOT, 'data', 'raw');
export const PROCESSED_DIR = path.join(REPO_ROOT, 'data', 'processed');

export const rawYearDir = (year: number) => path.join(RAW_DIR, String(year));
