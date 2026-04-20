import { Fragment } from "react";
import Link from "next/link";
import { authorPath } from "@/lib/authors";
import { displayAuthorList } from "@/lib/bookDisplay";

type AuthorLinksProps = {
  author: string;
  authors?: string[];
  className?: string;
  linkClassName?: string;
  prefix?: string;
};

export function AuthorLinks({ author, authors, className = "", linkClassName = "", prefix = "" }: AuthorLinksProps) {
  const names = displayAuthorList({ author, authors });
  if (names.length === 0) return null;

  const classNames = ["author-links", className].filter(Boolean).join(" ");
  const authorLinkClassNames = ["author-link", linkClassName].filter(Boolean).join(" ");

  return (
    <span className={classNames} title={names.join(", ")}>
      {prefix ? <span className="author-prefix">{prefix}</span> : null}
      {names.map((name, index) => (
        <Fragment key={name}>
          <Link className={authorLinkClassNames} href={authorPath(name)} aria-label={`View books by ${name}`} prefetch={false}>
            {name}
          </Link>
          {index < names.length - 1 ? <span className="author-separator">, </span> : null}
        </Fragment>
      ))}
    </span>
  );
}
