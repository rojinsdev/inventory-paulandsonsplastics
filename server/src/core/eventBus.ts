import { EventEmitter } from 'events';

/**
 * Global Event Bus for the application.
 * Used for decoupling core business logic from side effects.
 */
class GlobalEventBus extends EventEmitter {
    private static instance: GlobalEventBus;

    private constructor() {
        super();
        // Increase limit for listeners as we scale
        this.setMaxListeners(50);
    }

    public static getInstance(): GlobalEventBus {
        if (!GlobalEventBus.instance) {
            GlobalEventBus.instance = new GlobalEventBus();
        }
        return GlobalEventBus.instance;
    }
}

export const eventBus = GlobalEventBus.getInstance();
