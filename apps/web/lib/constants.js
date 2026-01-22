import { ShoppingCart, Users, Factory, Boxes, BarChart3, Truck, Package } from 'lucide-react';

export const AVAILABLE_QUICK_ACTIONS = [
    {
        id: 'newSale',
        label: 'Sales Orders',
        subtitle: 'Manage orders',
        href: '/orders',
        icon: ShoppingCart,
        category: 'Sales'
    },
    {
        id: 'addCustomer',
        label: 'Customers',
        subtitle: 'Manage client database',
        href: '/customers',
        icon: Users,
        category: 'Sales'
    },
    {
        id: 'logProduction',
        label: 'Machines',
        subtitle: 'Monitor production status',
        href: '/machines',
        icon: Factory,
        category: 'Production'
    },
    {
        id: 'checkStock',
        label: 'Live Inventory',
        subtitle: 'Real-time stock levels',
        href: '/inventory/live',
        icon: Boxes,
        category: 'Inventory'
    },
    {
        id: 'analytics',
        label: 'Analytics',
        subtitle: 'Performance insights',
        href: '/reports/analytics',
        icon: BarChart3,
        category: 'Reports'
    },
    {
        id: 'deliveries',
        label: 'Deliveries',
        subtitle: 'Track shipments',
        href: '/deliveries',
        icon: Truck,
        category: 'Sales'
    },
    {
        id: 'products',
        label: 'Products',
        subtitle: 'Product catalog',
        href: '/products',
        icon: Package,
        category: 'Production'
    }
];
