type Handler<Payload> = (payload: Payload) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof Events, Set<Handler<Events[keyof Events]>>>();

  on<Name extends keyof Events>(name: Name, handler: Handler<Events[Name]>): () => void {
    const handlers = this.handlers.get(name) ?? new Set<Handler<Events[keyof Events]>>();
    handlers.add(handler as Handler<Events[keyof Events]>);
    this.handlers.set(name, handlers);

    return () => {
      handlers.delete(handler as Handler<Events[keyof Events]>);
      if (handlers.size === 0) {
        this.handlers.delete(name);
      }
    };
  }

  emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void {
    const handlers = this.handlers.get(name);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      handler(payload);
    }
  }
}

