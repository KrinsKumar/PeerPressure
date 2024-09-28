// schema register a new worker to redis -> body
export const registerWorker = (id, route, status, last_seen) => {
  return {
    id,
    route,
    status,
    last_seen,
  };
};
