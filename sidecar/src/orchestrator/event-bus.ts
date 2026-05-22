type Handler<Payload> = (payload: Payload) => void;
type AnyEvent<Events extends Record<string, unknown>> = {
  [Name in keyof Events]: {
    name: Name;
    payload: Events[Name];
  };
}[keyof Events];
type AnyHandler<Events extends Record<string, unknown>> = (event: AnyEvent<Events>) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof Events, Set<Handler<Events[keyof Events]>>>();
  private readonly anyHandlers = new Set<AnyHandler<Events>>();

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

  onAny(handler: AnyHandler<Events>): () => void {
    this.anyHandlers.add(handler);

    return () => {
      this.anyHandlers.delete(handler);
    };
  }

  emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void {
    const handlers = this.handlers.get(name);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }

    for (const handler of this.anyHandlers) {
      handler({ name, payload });
    }
  }
}
