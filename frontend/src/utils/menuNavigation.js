// Compatibility barrel for non-rendering consumers.  The permission store and
// router import menuTree directly; authenticated UI code imports menuIcons or
// menuSearch so the icon registry stays out of the entry graph.
export {
  isMenuDisplayable,
  prepareMenuTree,
  isRouteMatch,
  resolveMenuNavigationState
} from './menuTree'
export { buildMenuSearchOptions } from './menuSearch'
export { getIconComponent } from './menuIcons'
