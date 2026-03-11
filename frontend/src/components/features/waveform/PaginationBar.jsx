/**
 * PaginationBar – page navigation + window size selector for long recordings.
 */
import React from 'react';
import {
  RiArrowLeftSLine, RiArrowRightSLine,
  RiSkipBackLine, RiSkipForwardLine,
} from 'react-icons/ri';
import styles from './PaginationBar.module.css';

const WINDOW_OPTIONS = [
  { label: '100 ms', value: 100 },
  { label: '200 ms', value: 200 },
  { label: '500 ms', value: 500 },
  { label: '1 s', value: 1000 },
  { label: '2 s', value: 2000 },
  { label: '5 s', value: 5000 },
];

const PaginationBar = ({ page, totalPages, windowMs, onPageChange, onWindowChange }) => {
  return (
    <div className={styles.bar}>
      {/* Window size */}
      <div className={styles.windowGroup}>
        <span className={styles.label}>Window:</span>
        <select
          className={styles.windowSelect}
          value={windowMs}
          onChange={(e) => onWindowChange(Number(e.target.value))}
        >
          {WINDOW_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Page navigation */}
      <div className={styles.navGroup}>
        <button
          className={styles.navBtn}
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          title="First page"
        ><RiSkipBackLine /></button>
        <button
          className={styles.navBtn}
          onClick={() => onPageChange(p => Math.max(1, p - 1))}
          disabled={page <= 1}
          title="Previous page"
        ><RiArrowLeftSLine /></button>

        <span className={styles.pageInfo}>
          <span className={styles.pageNum}>{page}</span>
          <span className={styles.pageSep}>/</span>
          <span className={styles.totalPages}>{totalPages}</span>
        </span>

        <button
          className={styles.navBtn}
          onClick={() => onPageChange(p => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          title="Next page"
        ><RiArrowRightSLine /></button>
        <button
          className={styles.navBtn}
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          title="Last page"
        ><RiSkipForwardLine /></button>
      </div>
    </div>
  );
};

export default PaginationBar;
