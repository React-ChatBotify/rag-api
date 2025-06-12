import { runSyncDocuments } from './syncCoreLibDocs';

// on initial start, always sync
void runSyncDocuments();

// todo: ideally a cronjob should be used to only spin up job pod when required
// but nvm this is good enough for now
// todo: consider caching locally in mongodb to reduce requests to github
setInterval(() => void runSyncDocuments(), 86400000);
