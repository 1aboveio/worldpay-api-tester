/**
 * Prisma client — in production replaced by `prisma generate` output.
 * This shim provides a mock-compatible interface for development and testing.
 */

function createLazyProxy(): Record<string, unknown> {
  const cache = new Map<string, unknown>();
  return new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (Reflect.has(_target, prop)) {
          return Reflect.get(_target, prop);
        }
        if (cache.has(prop)) {
          return cache.get(prop);
        }
        const modelProxy = new Proxy(
          {},
          {
            get(mTarget: Record<string, unknown>, mProp: string) {
              if (Reflect.has(mTarget, mProp)) {
                return Reflect.get(mTarget, mProp);
              }
              return () => undefined;
            },
            set(mTarget: Record<string, unknown>, mProp: string, value: unknown) {
              Object.defineProperty(mTarget, mProp, {
                value,
                writable: true,
                configurable: true,
              });
              return true;
            },
          }
        ) as Record<string, unknown>;
        cache.set(prop, modelProxy);
        return modelProxy;
      },
      set(_target: Record<string, unknown>, prop: string, value: unknown) {
        Object.defineProperty(_target, prop, {
          value,
          writable: true,
          configurable: true,
        });
        cache.set(prop, value);
        return true;
      },
    }
  ) as unknown as Record<string, unknown>;
}

class PrismaClientShim {
  constructor() {
    return createLazyProxy() as unknown as this;
  }
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClientShim };

export const prisma = globalForPrisma.prisma || new PrismaClientShim();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
