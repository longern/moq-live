import { DEFAULT_MEDIA_ORIENTATION, MEDIA_ORIENTATION_PORTRAIT } from "./mediaLayout.js";

export const MAX_COHOST_PARTICIPANTS = 9;

export function normalizeCohostParticipantCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) {
    return 1;
  }
  return Math.min(MAX_COHOST_PARTICIPANTS, Math.max(1, Math.floor(count)));
}

function createPlacement(column, row, columnSpan = 1, rowSpan = 1) {
  return { column, row, columnSpan, rowSpan };
}

function getLayoutShape({ count, portraitViewport, hostOrientation, allLandscape }) {
  if (count <= 1) {
    return {
      columns: 1,
      rows: 1,
      hostPlacement: createPlacement(1, 1),
    };
  }

  if (count === 2) {
    return portraitViewport && allLandscape
      ? { columns: 1, rows: 2, hostPlacement: createPlacement(1, 1) }
      : { columns: 2, rows: 1, hostPlacement: createPlacement(1, 1) };
  }

  if (count === 3) {
    return hostOrientation === MEDIA_ORIENTATION_PORTRAIT
      ? { columns: 2, rows: 2, hostPlacement: createPlacement(1, 1, 1, 2) }
      : { columns: 2, rows: 2, hostPlacement: createPlacement(1, 1, 2, 1) };
  }

  if (count === 4) {
    return {
      columns: 2,
      rows: 2,
      hostPlacement: createPlacement(1, 1),
    };
  }

  if (count === 5) {
    return hostOrientation === MEDIA_ORIENTATION_PORTRAIT
      ? {
        columns: portraitViewport ? 2 : 3,
        rows: portraitViewport ? 3 : 2,
        hostPlacement: createPlacement(1, 1, 1, 2),
      }
      : {
        columns: portraitViewport ? 2 : 3,
        rows: portraitViewport ? 3 : 2,
        hostPlacement: createPlacement(1, 1, 2, 1),
      };
  }

  if (count === 6) {
    return {
      columns: portraitViewport ? 2 : 3,
      rows: portraitViewport ? 3 : 2,
      hostPlacement: createPlacement(1, 1),
    };
  }

  if (count === 7) {
    return hostOrientation === MEDIA_ORIENTATION_PORTRAIT
      ? {
        columns: portraitViewport ? 2 : 4,
        rows: portraitViewport ? 4 : 2,
        hostPlacement: createPlacement(1, 1, 1, 2),
      }
      : {
        columns: portraitViewport ? 2 : 4,
        rows: portraitViewport ? 4 : 2,
        hostPlacement: createPlacement(1, 1, 2, 1),
      };
  }

  if (count === 8) {
    if (!portraitViewport) {
      return {
        columns: 4,
        rows: 2,
        hostPlacement: createPlacement(1, 1),
      };
    }
    return hostOrientation === MEDIA_ORIENTATION_PORTRAIT
      ? {
        columns: 3,
        rows: 3,
        hostPlacement: createPlacement(1, 1, 1, 2),
      }
      : {
        columns: 3,
        rows: 3,
        hostPlacement: createPlacement(1, 1, 2, 1),
      };
  }

  return {
    columns: 3,
    rows: 3,
    hostPlacement: createPlacement(1, 1),
  };
}

function buildPlacements({ columns, rows, count, hostPlacement }) {
  const occupied = new Set();
  const placements = [hostPlacement];

  for (let row = hostPlacement.row; row < hostPlacement.row + hostPlacement.rowSpan; row += 1) {
    for (let column = hostPlacement.column; column < hostPlacement.column + hostPlacement.columnSpan; column += 1) {
      occupied.add(`${column}:${row}`);
    }
  }

  for (let row = 1; row <= rows && placements.length < count; row += 1) {
    for (let column = 1; column <= columns && placements.length < count; column += 1) {
      const key = `${column}:${row}`;
      if (occupied.has(key)) {
        continue;
      }
      occupied.add(key);
      placements.push(createPlacement(column, row));
    }
  }

  return placements;
}

export function getCohostLayoutGuide({
  participantCount,
  portraitViewport = false,
  orientations = [],
  baseClassName = "cohost-layout",
} = {}) {
  const count = normalizeCohostParticipantCount(participantCount);
  const normalizedOrientations = orientations.slice(0, count).map((orientation) => (
    orientation === MEDIA_ORIENTATION_PORTRAIT
      ? MEDIA_ORIENTATION_PORTRAIT
      : DEFAULT_MEDIA_ORIENTATION
  ));
  const allLandscape = normalizedOrientations.length === count
    && normalizedOrientations.every((orientation) => orientation === DEFAULT_MEDIA_ORIENTATION);
  const hostOrientation = normalizedOrientations[0] || DEFAULT_MEDIA_ORIENTATION;
  const twoLandscapePortraitStack = count === 2 && portraitViewport && allLandscape;
  const shape = getLayoutShape({
    count,
    portraitViewport,
    hostOrientation,
    allLandscape,
  });
  const className = [
    baseClassName,
    `${baseClassName}-${count}`,
    portraitViewport ? "is-portrait-viewport" : "is-landscape-viewport",
    hostOrientation === MEDIA_ORIENTATION_PORTRAIT ? "is-host-portrait" : "is-host-landscape",
    twoLandscapePortraitStack ? "is-two-landscape-portrait-stack" : "",
  ].filter(Boolean).join(" ");

  return {
    ...shape,
    className,
    placements: buildPlacements({
      ...shape,
      count,
    }),
  };
}

export function getCohostLayoutClassName(options = {}) {
  return getCohostLayoutGuide(options).className;
}

export function getCohostTilePlacementStyle(placement) {
  if (!placement) {
    return undefined;
  }
  return {
    gridColumn: `${placement.column} / span ${placement.columnSpan}`,
    gridRow: `${placement.row} / span ${placement.rowSpan}`,
  };
}
