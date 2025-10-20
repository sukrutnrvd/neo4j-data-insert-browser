# Neo4j Bulk Insert Browser

This is a web-based tool for bulk-importing data into a Neo4j database from CSV files. It provides a user-friendly interface to upload nodes and relationships separately, with clear guidelines on the required CSV format.

## Technologies Used

- [Next.js 14](https://nextjs.org/docs/getting-started)
- [HeroUI v2](https://heroui.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [TypeScript](https://www.typescriptlang.org/)
- [Zustand](https://github.com/pmndrs/zustand) for state management
- [PapaParse](https://www.papaparse.com/) for CSV parsing
- [React Dropzone](https://react-dropzone.js.org/) for file uploads
- [Neo4j Driver](https://neo4j.com/docs/javascript-manual/current/driver-quickstart/)

## How to Use

### Install dependencies

You can use one of them `npm`, `yarn`, `pnpm`, `bun`, Example using `yarn`:

```bash
yarn install
```

### Run the development server

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Setup Neo4j Connection

Before uploading data, you need to provide your Neo4j database credentials. Click on the "Connect to Neo4j" button and enter your database URL, username, and password.

### Data Upload

The application has two main tabs: "Upload Nodes" and "Upload Relationships".

#### Node CSV Format

- The CSV file **must have a header row**.
- One column **must be named "LABEL"** - this will be used as the node label.
- It is recommended to have an `id` column to uniquely identify nodes, which is necessary for creating relationships later.
- All other columns will be treated as node properties.

**Example:**

```csv
id,LABEL,name,age
1,Person,"John Doe",30
2,Company,"Neo4j",20
```

#### Relationship CSV Format

- The CSV file **must have a header row**.
- **Required columns**: `TYPE`, `FROM_LABEL`, `FROM_ID`, `TO_LABEL`, `TO_ID`.
- `TYPE`: The type of the relationship (e.g., `WORKS_AT`).
- `FROM_LABEL` & `FROM_ID`: The label and ID of the source node.
- `TO_LABEL` & `TO_ID`: The label and ID of the target node.
- All other columns will be treated as relationship properties.

**Example:**

```csv
TYPE,FROM_LABEL,FROM_ID,TO_LABEL,TO_ID,since
WORKS_AT,Person,1,Company,2,2022
```

## License

Licensed under the [MIT license](https://github.com/heroui-inc/next-app-template/blob/main/LICENSE).
