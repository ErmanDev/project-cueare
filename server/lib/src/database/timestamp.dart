import 'package:drift/drift.dart';
import 'package:drift_postgres/drift_postgres.dart';

/// Postgres: `timestamp with time zone`. SQLite tests: default datetime.
class _DialectAwareTimestampType implements DialectAwareSqlType<PgDateTime> {
  static const _postgres = PgTypes.timestampWithTimezone;
  static const _other = DriftSqlType.dateTime;

  const _DialectAwareTimestampType();

  @override
  String mapToSqlLiteral(GenerationContext context, PgDateTime dartValue) {
    return switch (context.dialect) {
      SqlDialect.postgres => _postgres.mapToSqlLiteral(dartValue),
      _ => context.typeMapping.mapToSqlLiteral(dartValue.dateTime),
    };
  }

  @override
  Object mapToSqlParameter(GenerationContext context, PgDateTime dartValue) {
    return switch (context.dialect) {
      SqlDialect.postgres => _postgres.mapToSqlParameter(dartValue),
      _ => context.typeMapping.mapToSqlVariable(dartValue.dateTime)!,
    };
  }

  @override
  PgDateTime read(SqlTypes typeSystem, Object fromSql) {
    return switch (typeSystem.dialect) {
      SqlDialect.postgres => _postgres.read(fromSql),
      _ => PgDateTime(typeSystem.read(_other, fromSql)!),
    };
  }

  @override
  String sqlTypeName(GenerationContext context) {
    return switch (context.dialect) {
      SqlDialect.postgres => _postgres.sqlTypeName(context),
      _ => _other.sqlTypeName(context),
    };
  }
}

const pgTimestamp = _DialectAwareTimestampType();

PgDateTime pgNow() => PgDateTime(DateTime.now());

PgDateTime pgDateTime(DateTime value) => PgDateTime(value);
