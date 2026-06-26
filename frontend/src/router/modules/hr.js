/**
 * 人力资源模块路由
 */
import ModuleContainer from '../../components/common/ModuleContainer.vue'

export default {
    path: 'hr',
    name: 'hr',
    component: ModuleContainer,
    props: { moduleName: 'hr' },
    meta: {
        requiresAuth: true,
        permission: 'hr'
    },
    children: [
        {
            path: '',
            name: 'hr-dashboard',
            redirect: '/hr/employees'
        },
        {
            path: 'employees',
            name: 'hr-employees',
            component: () => import('../../views/hr/Employees.vue'),
            meta: {
                requiresAuth: true,
                permission: 'hr:employees'
            }
        },
        {
            path: 'attendance',
            name: 'hr-attendance',
            component: () => import('../../views/hr/Attendance.vue'),
            meta: {
                requiresAuth: true,
                permission: 'hr:attendance'
            }
        },
        {
            path: 'salary',
            name: 'hr-salary',
            component: () => import('../../views/hr/Salary.vue'),
            meta: {
                requiresAuth: true,
                permission: 'hr:salary'
            }
        },
        {
            path: 'performance',
            name: 'hr-performance',
            component: () => import('../../views/hr/Performance.vue'),
            meta: {
                requiresAuth: true,
                permission: 'hr:performance'
            }
        },
        {
            path: 'skills',
            name: 'hr-skills',
            component: () => import('../../views/hr/EmployeeSkills.vue'),
            meta: {
                requiresAuth: true,
                permission: 'hr:skills'
            }
        }
    ]
}
