import React, { Suspense, useState } from "react";
import PropTypes from "prop-types";
import { useSelector, useDispatch } from "react-redux";
import { Link, useHistory } from "react-router-dom";

import TableCell from "@material-ui/core/TableCell";
import TableRow from "@material-ui/core/TableRow";
import IconButton from "@material-ui/core/IconButton";
import Button from "@material-ui/core/Button";
import Grid from "@material-ui/core/Grid";
import Chip from "@material-ui/core/Chip";
import PictureAsPdfIcon from "@material-ui/icons/PictureAsPdf";
import MUIDataTable from "mui-datatables";
import {
  makeStyles,
  createMuiTheme,
  MuiThemeProvider,
  useTheme,
} from "@material-ui/core/styles";
import Tooltip from "@material-ui/core/Tooltip";
import GroupIcon from "@material-ui/icons/Group";
import CheckIcon from "@material-ui/icons/Check";
import ClearIcon from "@material-ui/icons/Clear";

import dayjs from "dayjs";

import { ra_to_hours, dec_to_dms, time_relative_to_local } from "../units";
import styles from "./CommentList.css";
import ThumbnailList from "./ThumbnailList";
import UserAvatar from "./UserAvatar";
import ShowClassification from "./ShowClassification";
import SourceTableFilterForm from "./SourceTableFilterForm";
import FavoritesButton from "./FavoritesButton";
import * as sourceActions from "../ducks/source";
import * as sourcesActions from "../ducks/sources";
import { filterOutEmptyValues } from "../API";

const VegaPlot = React.lazy(() => import("./VegaPlot"));
const VegaSpectrum = React.lazy(() => import("./VegaSpectrum"));

const useStyles = makeStyles((theme) => ({
  chip: {
    margin: theme.spacing(0.5),
  },
  source: {},
  commentListContainer: {
    height: "15rem",
    overflowY: "scroll",
    padding: "0.5rem 0",
  },
  tableGrid: {
    width: "100%",
  },
  groupSelect: {
    maxWidth: "20rem",
  },
  filterFormRow: {
    margin: "0.75rem 0",
  },
  sourceName: {
    verticalAlign: "middle",
  },
  starButton: {
    verticalAlign: "middle",
  },
}));

const getMuiTheme = (theme) =>
  createMuiTheme({
    palette: theme.palette,
    overrides: {
      MUIDataTableHeadCell: {
        sortLabelRoot: {
          height: "1.4rem",
        },
      },
      // Hide default filter items for custom form
      MuiGridList: {
        root: {
          display: "none",
        },
      },
      MUIDataTableFilter: {
        header: {
          display: "none",
        },
      },
    },
  });

let defaultDisplayedColumns = [
  "Source ID",
  "Favorites",
  "RA (deg)",
  "Dec (deg)",
  "Redshift",
  "Classification",
  "Groups",
  "Date Saved",
  "Finder",
];

// MUI data table with pull out rows containing a summary of each source.
// This component is used in GroupSources, SourceList and Favorites page.
const SourceTable = ({
  sources,
  title,
  sourceStatus = "saved",
  groupID,
  paginateCallback,
  pageNumber,
  totalMatches,
  numPerPage,
  sortingCallback,
  favoritesRemoveButton = false,
}) => {
  // sourceStatus should be one of either "saved" (default) or "requested" to add a button to agree to save the source.
  // If groupID is not given, show all data available to user's accessible groups

  const dispatch = useDispatch();
  const { taxonomyList } = useSelector((state) => state.taxonomies);
  const classes = useStyles();
  const theme = useTheme();

  if (favoritesRemoveButton) {
    defaultDisplayedColumns = defaultDisplayedColumns.filter(
      (c) => c !== "Favorites"
    );
  }

  const [displayedColumns, setDisplayedColumns] = useState(
    defaultDisplayedColumns
  );

  const [tableFilterList, setTableFilterList] = useState([]);
  const [filterFormData, setFilterFormData] = useState(null);
  const [rowsPerPage, setRowsPerPage] = useState(numPerPage);

  // Color styling
  const userColorTheme = useSelector(
    (state) => state.profile.preferences.theme
  );
  const commentStyle =
    userColorTheme === "dark" ? styles.commentDark : styles.comment;

  const handleTableChange = (action, tableState) => {
    switch (action) {
      case "changePage":
      case "changeRowsPerPage":
        setRowsPerPage(tableState.rowsPerPage);
        paginateCallback(
          tableState.page + 1,
          tableState.rowsPerPage,
          tableState.sortOrder,
          filterFormData
        );
        break;
      case "viewColumnsChange":
        // Save displayed column labels
        setDisplayedColumns(
          tableState.columns
            .filter((column) => column.display === "true")
            .map((column) => column.label)
        );
        break;
      case "sort":
        if (tableState.sortOrder.direction === "none") {
          paginateCallback(1, tableState.rowsPerPage, {}, filterFormData);
        } else {
          sortingCallback(tableState.sortOrder, filterFormData);
        }
        break;
      default:
    }
  };

  const handleSaveSource = async (sourceID) => {
    const result = await dispatch(
      sourceActions.acceptSaveRequest({ sourceID, groupID })
    );
    if (result.status === "success") {
      dispatch(
        sourcesActions.fetchPendingGroupSources({
          group_ids: [groupID],
          pageNumber: 1,
          numPerPage: 10,
        })
      );
      dispatch(
        sourcesActions.fetchSavedGroupSources({
          group_ids: [groupID],
          pageNumber: 1,
          numPerPage: 10,
        })
      );
    }
  };

  const handleIgnoreSource = async (sourceID) => {
    const result = await dispatch(
      sourceActions.declineSaveRequest({ sourceID, groupID })
    );
    if (result.status === "success") {
      dispatch(
        sourcesActions.fetchPendingGroupSources({
          group_ids: [groupID],
          pageNumber: 1,
          numPerPage: 10,
        })
      );
    }
  };

  // This is just passed to MUI datatables options -- not meant to be instantiated directly.
  const renderPullOutRow = (rowData, rowMeta) => {
    const colSpan = rowData.length + 1;
    const source = sources[rowMeta.dataIndex];

    const comments = source.comments || [];

    return (
      <TableRow data-testid={`groupSourceExpand_${source.id}`}>
        <TableCell
          style={{ paddingBottom: 0, paddingTop: 0 }}
          colSpan={colSpan}
        >
          <Grid
            container
            direction="row"
            spacing={3}
            justify="center"
            alignItems="center"
          >
            <ThumbnailList
              thumbnails={source.thumbnails}
              ra={source.ra}
              dec={source.dec}
              useGrid={false}
            />
            <Grid item>
              {source.photometry_exists && (
                <Suspense fallback={<div>Loading plot...</div>}>
                  <VegaPlot dataUrl={`/api/sources/${source.id}/photometry`} />
                </Suspense>
              )}
              {!source.photometry_exists && <div> no photometry exists </div>}
            </Grid>
            <Grid item>
              {source.spectrum_exists && (
                <Suspense fallback={<div>Loading spectra...</div>}>
                  <VegaSpectrum
                    dataUrl={`/api/sources/${source.id}/spectra?normalization=median`}
                  />
                </Suspense>
              )}
              {!source.spectrum_exists && <div> no spectra exist </div>}
            </Grid>
            <Grid item>
              <div className={classes.commentListContainer}>
                {comments.map(
                  ({
                    id,
                    author,
                    author_info,
                    created_at,
                    text,
                    attachment_name,
                    groups: comment_groups,
                  }) => (
                    <span key={id} className={commentStyle}>
                      <div className={styles.commentUserAvatar}>
                        <UserAvatar
                          size={24}
                          firstName={author_info.first_name}
                          lastName={author_info.last_name}
                          username={author_info.username}
                          gravatarUrl={author_info.gravatar_url}
                        />
                      </div>
                      <div className={styles.commentContent}>
                        <div className={styles.commentHeader}>
                          <span className={styles.commentUser}>
                            <span className={styles.commentUserName}>
                              {author.username}
                            </span>
                          </span>
                          <span className={styles.commentTime}>
                            {dayjs().to(dayjs.utc(`${created_at}Z`))}
                          </span>
                          <div className={styles.commentUserGroup}>
                            <Tooltip
                              title={comment_groups
                                .map((group) => group.name)
                                .join(", ")}
                            >
                              <GroupIcon
                                fontSize="small"
                                viewBox="0 -2 24 24"
                              />
                            </Tooltip>
                          </div>
                        </div>
                        <div className={styles.wrap} name={`commentDiv${id}`}>
                          <div className={styles.commentMessage}>{text}</div>
                        </div>
                        <span>
                          {attachment_name && (
                            <div>
                              Attachment:&nbsp;
                              <a href={`/api/comment/${id}/attachment`}>
                                {attachment_name}
                              </a>
                            </div>
                          )}
                        </span>
                      </div>
                    </span>
                  )
                )}
              </div>
            </Grid>
            {favoritesRemoveButton ? (
              <div>
                {" "}
                <FavoritesButton sourceID={source.id} textMode />{" "}
              </div>
            ) : (
              ""
            )}
          </Grid>
        </TableCell>
      </TableRow>
    );
  };

  // This is just passed to MUI datatables options -- not meant to be instantiated directly.
  const renderObjId = (dataIndex) => {
    const objid = sources[dataIndex].id;
    return (
      <Link
        to={`/source/${objid}`}
        key={`${objid}_objid`}
        data-testid={`${objid}`}
      >
        <span> {objid} </span>
      </Link>
    );
  };

  const renderFavoritesStar = (dataIndex) => {
    const objid = sources[dataIndex].id;
    return <FavoritesButton sourceID={objid} />;
  };

  const renderAlias = (dataIndex) => {
    const { id: objid, alias } = sources[dataIndex];

    return (
      <Link to={`/source/${objid}`} key={`${objid}_alias`}>
        {alias}
      </Link>
    );
  };

  // This is just passed to MUI datatables options -- not meant to be instantiated directly.

  const renderRA = (dataIndex) => {
    const source = sources[dataIndex];
    return <div key={`${source.id}_ra`}>{source.ra.toFixed(6)}</div>;
  };

  const renderRASex = (dataIndex) => {
    const source = sources[dataIndex];
    return <div key={`${source.id}_ra_sex`}>{ra_to_hours(source.ra)}</div>;
  };

  // This is just passed to MUI datatables options -- not meant to be instantiated directly.
  const renderDec = (dataIndex) => {
    const source = sources[dataIndex];
    return <div key={`${source.id}_dec`}>{source.dec.toFixed(6)}</div>;
  };

  const renderDecSex = (dataIndex) => {
    const source = sources[dataIndex];
    return <div key={`${source.id}_dec_sex`}>{dec_to_dms(source.dec)}</div>;
  };

  // helper function to get the classifications
  const getClassifications = (source) => {
    if (groupID !== undefined) {
      return source.classifications.filter((cls) =>
        cls.groups.find((g) => g.id === groupID)
      );
    }
    return source.classifications;
  };

  const renderClassification = (dataIndex) => {
    const source = sources[dataIndex];

    return (
      <Suspense fallback={<div>Loading classifications</div>}>
        <ShowClassification
          classifications={getClassifications(source)}
          taxonomyList={taxonomyList}
          shortened
        />
      </Suspense>
    );
  };

  // helper function to get the source groups
  const getGroups = (source) => source.groups.filter((group) => group.active);
  const history = useHistory();

  // This is just passed to MUI datatables options -- not meant to be instantiated directly.
  const renderGroups = (dataIndex) => {
    const source = sources[dataIndex];
    return (
      <div key={`${source.id}_groups`}>
        {getGroups(source).map((group) => (
          <div key={group.name}>
            <Chip
              label={group.name.substring(0, 15)}
              key={group.id}
              size="small"
              className={classes.chip}
              onClick={() => history.push(`/group/${group.id}`)}
            />
            <br />
          </div>
        ))}
      </div>
    );
  };

  // helper function to get the source saved_at date
  const getDate = (source) => {
    if (groupID !== undefined) {
      const group = source.groups.find((g) => g.id === groupID);
      return group?.saved_at;
    }
    const dates = source.groups.map((g) => g.saved_at).sort();
    return dates[dates.length - 1];
  };

  const renderDateSaved = (dataIndex) => {
    const source = sources[dataIndex];

    return (
      <div key={`${source.id}_date_saved`}>
        {getDate(source)?.substring(0, 19)}
      </div>
    );
  };

  // This is just passed to MUI datatables options -- not meant to be instantiated directly.
  const renderFinderButton = (dataIndex) => {
    const source = sources[dataIndex];
    return (
      <IconButton size="small" key={`${source.id}_actions`}>
        <a href={`/api/sources/${source.id}/finder`}>
          <PictureAsPdfIcon />
        </a>
      </IconButton>
    );
  };

  // This is just passed to MUI datatables options -- not meant to be instantiated directly.
  const renderSaveIgnore = (dataIndex) => {
    const source = sources[dataIndex];
    return (
      <>
        <Button
          size="small"
          variant="contained"
          onClick={() => {
            handleSaveSource(source.id);
          }}
          data-testid={`saveSourceButton_${source.id}`}
        >
          Save
        </Button>
        &nbsp;
        <Button
          size="small"
          variant="contained"
          onClick={() => {
            handleIgnoreSource(source.id);
          }}
          data-testid={`declineRequestButton_${source.id}`}
        >
          Ignore
        </Button>
      </>
    );
  };

  const renderSpectrumExists = (dataIndex) => {
    const source = sources[dataIndex];
    return source.spectrum_exists ? (
      <CheckIcon
        size="small"
        key={`${source.id}_spectrum_exists`}
        color="primary"
      />
    ) : (
      <ClearIcon
        size="small"
        key={`${source.id}_spectrum_exists`}
        color="secondary"
      />
    );
  };

  const renderPeakMagnitude = (dataIndex) => {
    const source = sources[dataIndex];
    return source.peak_detected_mag ? (
      <Tooltip title={time_relative_to_local(source.peak_detected_at)}>
        <div>{`${source.peak_detected_mag.toFixed(4)}`}</div>
      </Tooltip>
    ) : (
      <div>No photometry</div>
    );
  };

  const renderLatestMagnitude = (dataIndex) => {
    const source = sources[dataIndex];
    return source.last_detected_mag ? (
      <Tooltip title={time_relative_to_local(source.last_detected_at)}>
        <div>{`${source.last_detected_mag.toFixed(4)}`}</div>
      </Tooltip>
    ) : (
      <div>No photometry</div>
    );
  };

  const renderTNSName = (dataIndex) => {
    const source = sources[dataIndex];
    return (
      <div>
        {source.altdata && source.altdata.tns ? source.altdata.tns.name : ""}
      </div>
    );
  };

  const handleFilterSubmit = async (formData) => {
    // Remove empty position
    if (
      formData.position.ra === "" &&
      formData.position.dec === "" &&
      formData.position.radius === ""
    ) {
      delete formData.position;
    }

    const data = filterOutEmptyValues(formData);
    setTableFilterList(
      Object.entries(data).map(([key, value]) => {
        if (key === "position") {
          return `position: ${value.ra} (RA), ${value.dec} (Dec), ${value.radius} (Radius)`;
        }
        return `${key}: ${value}`;
      })
    );

    // Expand cone search params
    if ("position" in data) {
      data.ra = data.position.ra;
      data.dec = data.position.dec;
      data.radius = data.position.radius;
      delete data.position;
    }

    setFilterFormData(data);
    paginateCallback(1, rowsPerPage, {}, data);
  };

  const handleTableFilterChipChange = (column, filterList, type) => {
    if (type === "chip") {
      const sourceFilterList = filterList[0];
      // Convert chip filter list to filter form data
      const data = {};
      sourceFilterList.forEach((filterChip) => {
        const [key, value] = filterChip.split(": ");
        if (key === "position") {
          const fields = value.split(/\s*\(\D*\),*\s*/);
          [data.ra, data.dec, data.radius] = fields;
        } else {
          data[key] = value;
        }
      });
      setTableFilterList(sourceFilterList);
      setFilterFormData(data);
      paginateCallback(1, rowsPerPage, {}, data);
    }
  };

  const customFilterDisplay = () => (
    <SourceTableFilterForm handleFilterSubmit={handleFilterSubmit} />
  );

  const columns = [
    {
      name: "id",
      label: "Source ID",
      options: {
        // Hijack custom filtering for this column to use for the entire form
        filter: true,
        filterType: "custom",
        filterList: tableFilterList,
        filterOptions: {
          // eslint-disable-next-line react/display-name
          display: () => <></>,
        },
        sort: true,
        sortThirdClickReset: true,
        display: displayedColumns.includes("Source ID"),
        customBodyRenderLite: renderObjId,
      },
    },
    {
      name: "favorites",
      label: "Favorites",
      options: {
        display: displayedColumns.includes("Favorites"),
        customBodyRenderLite: renderFavoritesStar,
      },
    },
    {
      name: "Alias",
      options: {
        filter: false,
        sort: false,
        display: displayedColumns.includes("Alias"),
        customBodyRenderLite: renderAlias,
      },
    },
    {
      name: "ra",
      label: "RA (deg)",
      options: {
        filter: false,
        sort: true,
        sortThirdClickReset: true,
        display: displayedColumns.includes("RA (deg)"),
        customBodyRenderLite: renderRA,
      },
    },
    {
      name: "dec",
      label: "Dec (deg)",
      options: {
        filter: false,
        sort: true,
        sortThirdClickReset: true,
        display: displayedColumns.includes("Dec (deg)"),
        customBodyRenderLite: renderDec,
      },
    },
    {
      name: "ra",
      label: "RA (hh:mm:ss)",
      options: {
        filter: false,
        sort: true,
        sortThirdClickReset: true,
        display: displayedColumns.includes("RA (hh:mm:ss)"),
        customBodyRenderLite: renderRASex,
      },
    },
    {
      name: "dec",
      label: "Dec (dd:mm:ss)",
      options: {
        filter: false,
        sort: true,
        sortThirdClickReset: true,
        display: displayedColumns.includes("Dec (dd:mm:ss)"),
        customBodyRenderLite: renderDecSex,
      },
    },
    {
      name: "redshift",
      label: "Redshift",
      options: {
        filter: false,
        sort: true,
        sortThirdClickReset: true,
        display: displayedColumns.includes("Redshift"),
      },
    },
    {
      name: "classification",
      label: "Classification",
      options: {
        filter: false,
        sort: true,
        sortThirdClickReset: true,
        display: displayedColumns.includes("Classification"),
        customBodyRenderLite: renderClassification,
      },
    },
    {
      name: "groups",
      label: "Groups",
      options: {
        filter: false,
        sort: false,
        display: displayedColumns.includes("Groups"),
        customBodyRenderLite: renderGroups,
      },
    },
    {
      name: "saved_at",
      label: "Date Saved",
      options: {
        filter: false,
        sort: true,
        sortThirdClickReset: true,
        display: displayedColumns.includes("Date Saved"),
        customBodyRenderLite: renderDateSaved,
      },
    },
    {
      name: "Finder",
      options: {
        filter: false,
        sort: false,
        display: displayedColumns.includes("Finder"),
        customBodyRenderLite: renderFinderButton,
      },
    },
    {
      name: "Spectrum?",
      options: {
        filter: false,
        sort: false,
        customBodyRenderLite: renderSpectrumExists,
        display: displayedColumns.includes("Spectrum?"),
      },
    },
    {
      name: "Peak Magnitude",
      options: {
        filter: false,
        sort: false,
        customBodyRenderLite: renderPeakMagnitude,
        display: displayedColumns.includes("Peak Magnitude"),
      },
    },
    {
      name: "Latest Magnitude",
      options: {
        filter: false,
        sort: false,
        customBodyRenderLite: renderLatestMagnitude,
        display: displayedColumns.includes("Latest Magnitude"),
      },
    },
    {
      name: "TNS Name",
      options: {
        filter: false,
        sort: false,
        customBodyRenderLite: renderTNSName,
        display: displayedColumns.includes("TNS Name"),
      },
    },
  ];

  const options = {
    draggableColumns: { enabled: true },
    expandableRows: true,
    renderExpandableRow: renderPullOutRow,
    selectableRows: "none",
    sort: true,
    onTableChange: handleTableChange,
    serverSide: true,
    rowsPerPage: numPerPage,
    page: pageNumber - 1,
    rowsPerPageOptions: [10, 25, 50, 75, 100, 200],
    jumpToPage: true,
    pagination: true,
    count: totalMatches,
    filter: true,
    customFilterDialogFooter: customFilterDisplay,
    onFilterChange: handleTableFilterChipChange,
    search: false,
  };

  if (sourceStatus === "requested") {
    columns.push({
      name: "Save/Decline",
      options: {
        filter: false,
        customBodyRenderLite: renderSaveIgnore,
      },
    });
  }

  return (
    <div className={classes.source} data-testid={`source_table_${title}`}>
      <div>
        <Grid
          container
          direction="column"
          alignItems="center"
          justify="flex-start"
          spacing={3}
        >
          <Grid item className={classes.tableGrid}>
            <MuiThemeProvider theme={getMuiTheme(theme)}>
              <MUIDataTable
                title={title}
                columns={columns}
                data={sources}
                options={options}
              />
            </MuiThemeProvider>
          </Grid>
        </Grid>
      </div>
    </div>
  );
};

SourceTable.propTypes = {
  sources: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      ra: PropTypes.number,
      dec: PropTypes.number,
      alias: PropTypes.string,
      redshift: PropTypes.number,
      classifications: PropTypes.arrayOf(
        PropTypes.shape({
          id: PropTypes.number,
          classification: PropTypes.string,
          created_at: PropTypes.string,
          groups: PropTypes.arrayOf(
            PropTypes.shape({
              id: PropTypes.number,
              name: PropTypes.string,
            })
          ),
        })
      ),
      recent_comments: PropTypes.arrayOf(PropTypes.shape({})),
      altdata: PropTypes.shape({
        tns: PropTypes.shape({
          name: PropTypes.string,
        }),
      }),
      spectrum_exists: PropTypes.bool,
      last_detected_at: PropTypes.string,
      last_detected_mag: PropTypes.number,
      peak_detected_at: PropTypes.string,
      peak_detected_mag: PropTypes.number,
      groups: PropTypes.arrayOf(
        PropTypes.shape({
          id: PropTypes.number,
          name: PropTypes.string,
        })
      ),
    })
  ).isRequired,
  sourceStatus: PropTypes.string,
  groupID: PropTypes.number,
  title: PropTypes.string,
  paginateCallback: PropTypes.func.isRequired,
  pageNumber: PropTypes.number,
  totalMatches: PropTypes.number,
  numPerPage: PropTypes.number,
  sortingCallback: PropTypes.func,
  favoritesRemoveButton: PropTypes.bool,
};

SourceTable.defaultProps = {
  sourceStatus: "saved",
  groupID: undefined,
  title: "",
  pageNumber: 1,
  totalMatches: 0,
  numPerPage: 10,
  sortingCallback: null,
  favoritesRemoveButton: false,
};

export default SourceTable;
