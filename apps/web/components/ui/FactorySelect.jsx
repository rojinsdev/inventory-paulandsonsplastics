import { useFactory } from '@/contexts/FactoryContext';
import CustomSelect from './CustomSelect';
import { Loader2 } from 'lucide-react';

export default function FactorySelect({
    value,
    onChange,
    placeholder = 'Select Factory',
    required = false,
    disabled = false,
    className
}) {
    const { factories, loading } = useFactory();

    if (loading) {
        return (
            <div className="flex items-center gap-2 p-2 border rounded-md text-muted-foreground bg-slate-50">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Loading factories...</span>
            </div>
        );
    }

    const activeFactories = factories.filter(f => f.active);

    const options = activeFactories.map(f => ({
        value: f.id,
        label: `${f.name} (${f.code})`
    }));

    return (
        <CustomSelect
            value={value}
            onChange={onChange}
            options={options}
            placeholder={placeholder}
            disabled={disabled}
            className={className}
        />
    );
}
