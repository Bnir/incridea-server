import { builder } from "~/graphql/builder";

// with pagination and filtering
builder.queryField("events", (t) =>
  t.prismaConnection({
    type: "Event",
    cursor: "id",
    args: {
      contains: t.arg({
        type: "String",
        required: false,
      }),
    },
    resolve: async (query, root, args, ctx, info) => {
      const filter = args.contains ?? "";
      return await ctx.prisma.event.findMany({
        where: {
          OR: [
            {
              name: {
                contains: filter,
              },
            },
            {
              description: {
                contains: filter,
              },
            },
          ],
        },
        ...query,
      });
    },
  }),
);

//Events By ID
builder.queryField("eventById", (t) =>
  t.prismaField({
    type: "Event",
    args: {
      id: t.arg({
        type: "ID",
        required: true,
      }),
    },
    resolve: async (query, root, args, ctx, info) => {
      return await ctx.prisma.event.findUniqueOrThrow({
        where: {
          id: Number(args.id),
        },
        ...query,
      });
    },
  }),
);

builder.queryField("registeredEvents", (t) =>
  t.prismaField({
    type: ["Event"],
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) {
        throw new Error("Not authenticated");
      }
      return ctx.prisma.event.findMany({
        where: {
          Teams: {
            some: {
              TeamMembers: {
                some: {
                  userId: user.id,
                },
              },
            },
          },
        },
        ...query,
        include: {
          Teams: {
            where: {
              TeamMembers: {
                some: {
                  userId: user.id,
                },
              },
            },
          },
        },
      });
    },
  }),
);

builder.queryField("publishedEvents", (t) =>
  t.prismaField({
    type: ["Event"],
    resolve: async (query, root, args, ctx, info) => {
      const core_event = await ctx.prisma.event.findMany({
        where: {
          AND: [
            {
              published: true,
            },
            {
              category: "CORE",
            },
          ],
        },
        orderBy: {
          name: "asc",
        },
        ...query,
      });
      const non_core_event = await ctx.prisma.event.findMany({
        where: {
          AND: [
            {
              published: true,
            },
            {
              NOT: {
                category: "CORE",
              },
            },
          ],
        },
        orderBy: {
          name: "asc",
        },
        ...query,
      });
      return [...core_event, ...non_core_event];
    },
  }),
);

//completed events by checking if winners are present or not
builder.queryField("completedEvents", (t) =>
  t.prismaField({
    type: ["Event"],
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const eventIds = await ctx.prisma.winners.findMany({
        select: {
          eventId: true,
        },
      });
      const events = await ctx.prisma.event.findMany({
        where: {
          id: {
            in: eventIds.map((event) => event.eventId),
          },
        },
        ...query,
      });
      return events;
    },
  }),
);

class EventStatusClass {
  name: string;
  status: string;
  constructor(name: string, status: string) {
    this.name = name;
    this.status = status;
  }
}

const EventStatus = builder.objectType(EventStatusClass, {
  name: "EventStatus",
  fields: (t) => ({
    eventName: t.exposeString("name"),
    status: t.exposeString("status"),
  }),
});

builder.queryField("getEventStatus", (t) =>
  t.field({
    type: [EventStatus],
    resolve: async (root, args, ctx) => {
      const events = await ctx.prisma.event.findMany({
        where: {
          published: true,
        },
        include: {
          Rounds: { orderBy: { roundNo: "asc" } },
          Winner: true,
        },
      });

      const today = new Date();

      const eventStatuses = events.map((event) => {
        const isCompleted = event.Winner.length > 0;

        if (isCompleted) {
          return new EventStatusClass(event.name, "COMPLETED");
        }

        const ongoingRound = event.Rounds.find(
          (round) =>
            round.date &&
            round.date.getTime() <= today.getTime() &&
            !round.completed,
        );

        if (ongoingRound) {
          return new EventStatusClass(
            event.name,
            `ROUND ${ongoingRound.roundNo} ONGOING`,
          );
        }

        const yetToStartRound = event.Rounds.find(
          (round) => round.date && round.date.getTime() > today.getTime(),
        );

        if (yetToStartRound) {
          return new EventStatusClass(event.name, "YET_TO_START");
        }

        return new EventStatusClass(event.name, "COMPLETED");
      });

      return eventStatuses;
    },
  }),
);
