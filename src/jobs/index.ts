import { runSyncDocuments } from './syncCoreLibDocs';

// on initial start, always sync
void runSyncDocuments();

// todo: ideally a cronjob should be used to only spin up job pod when required
// but nvm this is good enough for now
setInterval(() => void runSyncDocuments(), 86400000);
