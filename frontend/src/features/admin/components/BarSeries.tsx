import React from "react";
import { toPercentHeights } from "../adminUtils";

interface BarSeriesProps {
  points: { date: string; value: number }[];
  label: string;
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

/** Biểu đồ cột thuần CSS (grid + chiều cao %). Số liệu đầy đủ nằm trong bảng ẩn cho screen reader. */
export const BarSeries: React.FC<BarSeriesProps> = ({ points, label }) => {
  const heights = toPercentHeights(points.map((p) => p.value));
  return (
    <figure className="m-0">
      <div
        aria-hidden="true"
        className="grid items-end gap-[2px] h-40 rounded-xl bg-surface-container-low p-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(0, 1fr))` }}
      >
        {points.map((p, i) => (
          <div
            key={p.date}
            title={`${shortDate(p.date)}: ${p.value}`}
            className="bg-primary-container rounded-t-sm min-h-[2px] hover:bg-primary transition-colors"
            style={{ height: `${heights[i]}%` }}
          />
        ))}
      </div>
      <figcaption className="mt-1 flex justify-between text-label-sm text-outline" aria-hidden="true">
        <span>{points[0] ? shortDate(points[0].date) : ""}</span>
        <span>{label}</span>
        <span>{points.length ? shortDate(points[points.length - 1].date) : ""}</span>
      </figcaption>
      <table className="sr-only">
        <caption>{label} theo ngày</caption>
        <thead>
          <tr>
            <th scope="col">Ngày</th>
            <th scope="col">Số lượng</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{p.date}</td>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};
