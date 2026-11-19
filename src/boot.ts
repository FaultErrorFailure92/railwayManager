// Start: in der Desktop-App erst die Spielstand-Datei abgleichen (Steam Cloud), dann das Spiel laden
import { pullStore } from './platform/Platform';

pullStore().finally(() => import('./main'));
