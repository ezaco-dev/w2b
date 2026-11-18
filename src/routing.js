export let routes = {};

export function Route(routeMapping) {
  Object.assign(routes, routeMapping);
}

export function Include(words) {
  const wordArray = Array.isArray(words) ? words : [words];
  return `__INCLUDE__:${wordArray.join(',')}`;
}
