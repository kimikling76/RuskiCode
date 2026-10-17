import type {ModelStatus} from './models';

// Separate from models.ts so client screens can check a status without bundling the whole catalog.
/** Only these statuses can be chosen; 'listed' and 'unverified' stay visible, disabled, with the reason. */
export const usableStatus = (s: ModelStatus) => s === 'tested' || s === 'docs';
