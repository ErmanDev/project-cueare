// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $UsersTable extends Users with TableInfo<$UsersTable, User> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $UsersTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _usernameMeta = const VerificationMeta(
    'username',
  );
  @override
  late final GeneratedColumn<String> username = GeneratedColumn<String>(
    'username',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways('UNIQUE'),
  );
  static const VerificationMeta _passwordHashMeta = const VerificationMeta(
    'passwordHash',
  );
  @override
  late final GeneratedColumn<String> passwordHash = GeneratedColumn<String>(
    'password_hash',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _roleMeta = const VerificationMeta('role');
  @override
  late final GeneratedColumn<String> role = GeneratedColumn<String>(
    'role',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<PgDateTime> createdAt =
      GeneratedColumn<PgDateTime>(
        'created_at',
        aliasedName,
        false,
        type: pgTimestamp,
        requiredDuringInsert: false,
        clientDefault: pgNow,
      );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<PgDateTime> updatedAt =
      GeneratedColumn<PgDateTime>(
        'updated_at',
        aliasedName,
        false,
        type: pgTimestamp,
        requiredDuringInsert: false,
        clientDefault: pgNow,
      );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    name,
    username,
    passwordHash,
    role,
    createdAt,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'users';
  @override
  VerificationContext validateIntegrity(
    Insertable<User> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('username')) {
      context.handle(
        _usernameMeta,
        username.isAcceptableOrUnknown(data['username']!, _usernameMeta),
      );
    } else if (isInserting) {
      context.missing(_usernameMeta);
    }
    if (data.containsKey('password_hash')) {
      context.handle(
        _passwordHashMeta,
        passwordHash.isAcceptableOrUnknown(
          data['password_hash']!,
          _passwordHashMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_passwordHashMeta);
    }
    if (data.containsKey('role')) {
      context.handle(
        _roleMeta,
        role.isAcceptableOrUnknown(data['role']!, _roleMeta),
      );
    } else if (isInserting) {
      context.missing(_roleMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  User map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return User(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      username: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}username'],
      )!,
      passwordHash: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}password_hash'],
      )!,
      role: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}role'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        pgTimestamp,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        pgTimestamp,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $UsersTable createAlias(String alias) {
    return $UsersTable(attachedDatabase, alias);
  }
}

class User extends DataClass implements Insertable<User> {
  final int id;
  final String name;
  final String username;
  final String passwordHash;

  /// 'superadmin' | 'moderator' — validated in code.
  final String role;
  final PgDateTime createdAt;
  final PgDateTime updatedAt;
  const User({
    required this.id,
    required this.name,
    required this.username,
    required this.passwordHash,
    required this.role,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['name'] = Variable<String>(name);
    map['username'] = Variable<String>(username);
    map['password_hash'] = Variable<String>(passwordHash);
    map['role'] = Variable<String>(role);
    map['created_at'] = Variable<PgDateTime>(createdAt, pgTimestamp);
    map['updated_at'] = Variable<PgDateTime>(updatedAt, pgTimestamp);
    return map;
  }

  UsersCompanion toCompanion(bool nullToAbsent) {
    return UsersCompanion(
      id: Value(id),
      name: Value(name),
      username: Value(username),
      passwordHash: Value(passwordHash),
      role: Value(role),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory User.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return User(
      id: serializer.fromJson<int>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      username: serializer.fromJson<String>(json['username']),
      passwordHash: serializer.fromJson<String>(json['passwordHash']),
      role: serializer.fromJson<String>(json['role']),
      createdAt: serializer.fromJson<PgDateTime>(json['createdAt']),
      updatedAt: serializer.fromJson<PgDateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'name': serializer.toJson<String>(name),
      'username': serializer.toJson<String>(username),
      'passwordHash': serializer.toJson<String>(passwordHash),
      'role': serializer.toJson<String>(role),
      'createdAt': serializer.toJson<PgDateTime>(createdAt),
      'updatedAt': serializer.toJson<PgDateTime>(updatedAt),
    };
  }

  User copyWith({
    int? id,
    String? name,
    String? username,
    String? passwordHash,
    String? role,
    PgDateTime? createdAt,
    PgDateTime? updatedAt,
  }) => User(
    id: id ?? this.id,
    name: name ?? this.name,
    username: username ?? this.username,
    passwordHash: passwordHash ?? this.passwordHash,
    role: role ?? this.role,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  User copyWithCompanion(UsersCompanion data) {
    return User(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      username: data.username.present ? data.username.value : this.username,
      passwordHash: data.passwordHash.present
          ? data.passwordHash.value
          : this.passwordHash,
      role: data.role.present ? data.role.value : this.role,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('User(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('username: $username, ')
          ..write('passwordHash: $passwordHash, ')
          ..write('role: $role, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, name, username, passwordHash, role, createdAt, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is User &&
          other.id == this.id &&
          other.name == this.name &&
          other.username == this.username &&
          other.passwordHash == this.passwordHash &&
          other.role == this.role &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class UsersCompanion extends UpdateCompanion<User> {
  final Value<int> id;
  final Value<String> name;
  final Value<String> username;
  final Value<String> passwordHash;
  final Value<String> role;
  final Value<PgDateTime> createdAt;
  final Value<PgDateTime> updatedAt;
  const UsersCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.username = const Value.absent(),
    this.passwordHash = const Value.absent(),
    this.role = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
  });
  UsersCompanion.insert({
    this.id = const Value.absent(),
    required String name,
    required String username,
    required String passwordHash,
    required String role,
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
  }) : name = Value(name),
       username = Value(username),
       passwordHash = Value(passwordHash),
       role = Value(role);
  static Insertable<User> custom({
    Expression<int>? id,
    Expression<String>? name,
    Expression<String>? username,
    Expression<String>? passwordHash,
    Expression<String>? role,
    Expression<PgDateTime>? createdAt,
    Expression<PgDateTime>? updatedAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (username != null) 'username': username,
      if (passwordHash != null) 'password_hash': passwordHash,
      if (role != null) 'role': role,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
    });
  }

  UsersCompanion copyWith({
    Value<int>? id,
    Value<String>? name,
    Value<String>? username,
    Value<String>? passwordHash,
    Value<String>? role,
    Value<PgDateTime>? createdAt,
    Value<PgDateTime>? updatedAt,
  }) {
    return UsersCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      username: username ?? this.username,
      passwordHash: passwordHash ?? this.passwordHash,
      role: role ?? this.role,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (username.present) {
      map['username'] = Variable<String>(username.value);
    }
    if (passwordHash.present) {
      map['password_hash'] = Variable<String>(passwordHash.value);
    }
    if (role.present) {
      map['role'] = Variable<String>(role.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<PgDateTime>(createdAt.value, pgTimestamp);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<PgDateTime>(updatedAt.value, pgTimestamp);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('UsersCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('username: $username, ')
          ..write('passwordHash: $passwordHash, ')
          ..write('role: $role, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }
}

class $StudentsTable extends Students with TableInfo<$StudentsTable, Student> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $StudentsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _studentIdCodeMeta = const VerificationMeta(
    'studentIdCode',
  );
  @override
  late final GeneratedColumn<String> studentIdCode = GeneratedColumn<String>(
    'student_id_code',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways('UNIQUE'),
  );
  static const VerificationMeta _fullNameMeta = const VerificationMeta(
    'fullName',
  );
  @override
  late final GeneratedColumn<String> fullName = GeneratedColumn<String>(
    'full_name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sectionMeta = const VerificationMeta(
    'section',
  );
  @override
  late final GeneratedColumn<String> section = GeneratedColumn<String>(
    'section',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _photoUrlMeta = const VerificationMeta(
    'photoUrl',
  );
  @override
  late final GeneratedColumn<String> photoUrl = GeneratedColumn<String>(
    'photo_url',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<PgDateTime> createdAt =
      GeneratedColumn<PgDateTime>(
        'created_at',
        aliasedName,
        false,
        type: pgTimestamp,
        requiredDuringInsert: false,
        clientDefault: pgNow,
      );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<PgDateTime> updatedAt =
      GeneratedColumn<PgDateTime>(
        'updated_at',
        aliasedName,
        false,
        type: pgTimestamp,
        requiredDuringInsert: false,
        clientDefault: pgNow,
      );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    studentIdCode,
    fullName,
    section,
    photoUrl,
    createdAt,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'students';
  @override
  VerificationContext validateIntegrity(
    Insertable<Student> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('student_id_code')) {
      context.handle(
        _studentIdCodeMeta,
        studentIdCode.isAcceptableOrUnknown(
          data['student_id_code']!,
          _studentIdCodeMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_studentIdCodeMeta);
    }
    if (data.containsKey('full_name')) {
      context.handle(
        _fullNameMeta,
        fullName.isAcceptableOrUnknown(data['full_name']!, _fullNameMeta),
      );
    } else if (isInserting) {
      context.missing(_fullNameMeta);
    }
    if (data.containsKey('section')) {
      context.handle(
        _sectionMeta,
        section.isAcceptableOrUnknown(data['section']!, _sectionMeta),
      );
    }
    if (data.containsKey('photo_url')) {
      context.handle(
        _photoUrlMeta,
        photoUrl.isAcceptableOrUnknown(data['photo_url']!, _photoUrlMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Student map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Student(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      studentIdCode: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}student_id_code'],
      )!,
      fullName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}full_name'],
      )!,
      section: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}section'],
      ),
      photoUrl: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}photo_url'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        pgTimestamp,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        pgTimestamp,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $StudentsTable createAlias(String alias) {
    return $StudentsTable(attachedDatabase, alias);
  }
}

class Student extends DataClass implements Insertable<Student> {
  final int id;

  /// The value encoded in the QR (e.g. STU-2026-0143).
  final String studentIdCode;
  final String fullName;
  final String? section;
  final String? photoUrl;
  final PgDateTime createdAt;
  final PgDateTime updatedAt;
  const Student({
    required this.id,
    required this.studentIdCode,
    required this.fullName,
    this.section,
    this.photoUrl,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['student_id_code'] = Variable<String>(studentIdCode);
    map['full_name'] = Variable<String>(fullName);
    if (!nullToAbsent || section != null) {
      map['section'] = Variable<String>(section);
    }
    if (!nullToAbsent || photoUrl != null) {
      map['photo_url'] = Variable<String>(photoUrl);
    }
    map['created_at'] = Variable<PgDateTime>(createdAt, pgTimestamp);
    map['updated_at'] = Variable<PgDateTime>(updatedAt, pgTimestamp);
    return map;
  }

  StudentsCompanion toCompanion(bool nullToAbsent) {
    return StudentsCompanion(
      id: Value(id),
      studentIdCode: Value(studentIdCode),
      fullName: Value(fullName),
      section: section == null && nullToAbsent
          ? const Value.absent()
          : Value(section),
      photoUrl: photoUrl == null && nullToAbsent
          ? const Value.absent()
          : Value(photoUrl),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory Student.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Student(
      id: serializer.fromJson<int>(json['id']),
      studentIdCode: serializer.fromJson<String>(json['studentIdCode']),
      fullName: serializer.fromJson<String>(json['fullName']),
      section: serializer.fromJson<String?>(json['section']),
      photoUrl: serializer.fromJson<String?>(json['photoUrl']),
      createdAt: serializer.fromJson<PgDateTime>(json['createdAt']),
      updatedAt: serializer.fromJson<PgDateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'studentIdCode': serializer.toJson<String>(studentIdCode),
      'fullName': serializer.toJson<String>(fullName),
      'section': serializer.toJson<String?>(section),
      'photoUrl': serializer.toJson<String?>(photoUrl),
      'createdAt': serializer.toJson<PgDateTime>(createdAt),
      'updatedAt': serializer.toJson<PgDateTime>(updatedAt),
    };
  }

  Student copyWith({
    int? id,
    String? studentIdCode,
    String? fullName,
    Value<String?> section = const Value.absent(),
    Value<String?> photoUrl = const Value.absent(),
    PgDateTime? createdAt,
    PgDateTime? updatedAt,
  }) => Student(
    id: id ?? this.id,
    studentIdCode: studentIdCode ?? this.studentIdCode,
    fullName: fullName ?? this.fullName,
    section: section.present ? section.value : this.section,
    photoUrl: photoUrl.present ? photoUrl.value : this.photoUrl,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  Student copyWithCompanion(StudentsCompanion data) {
    return Student(
      id: data.id.present ? data.id.value : this.id,
      studentIdCode: data.studentIdCode.present
          ? data.studentIdCode.value
          : this.studentIdCode,
      fullName: data.fullName.present ? data.fullName.value : this.fullName,
      section: data.section.present ? data.section.value : this.section,
      photoUrl: data.photoUrl.present ? data.photoUrl.value : this.photoUrl,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Student(')
          ..write('id: $id, ')
          ..write('studentIdCode: $studentIdCode, ')
          ..write('fullName: $fullName, ')
          ..write('section: $section, ')
          ..write('photoUrl: $photoUrl, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    studentIdCode,
    fullName,
    section,
    photoUrl,
    createdAt,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Student &&
          other.id == this.id &&
          other.studentIdCode == this.studentIdCode &&
          other.fullName == this.fullName &&
          other.section == this.section &&
          other.photoUrl == this.photoUrl &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class StudentsCompanion extends UpdateCompanion<Student> {
  final Value<int> id;
  final Value<String> studentIdCode;
  final Value<String> fullName;
  final Value<String?> section;
  final Value<String?> photoUrl;
  final Value<PgDateTime> createdAt;
  final Value<PgDateTime> updatedAt;
  const StudentsCompanion({
    this.id = const Value.absent(),
    this.studentIdCode = const Value.absent(),
    this.fullName = const Value.absent(),
    this.section = const Value.absent(),
    this.photoUrl = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
  });
  StudentsCompanion.insert({
    this.id = const Value.absent(),
    required String studentIdCode,
    required String fullName,
    this.section = const Value.absent(),
    this.photoUrl = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
  }) : studentIdCode = Value(studentIdCode),
       fullName = Value(fullName);
  static Insertable<Student> custom({
    Expression<int>? id,
    Expression<String>? studentIdCode,
    Expression<String>? fullName,
    Expression<String>? section,
    Expression<String>? photoUrl,
    Expression<PgDateTime>? createdAt,
    Expression<PgDateTime>? updatedAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (studentIdCode != null) 'student_id_code': studentIdCode,
      if (fullName != null) 'full_name': fullName,
      if (section != null) 'section': section,
      if (photoUrl != null) 'photo_url': photoUrl,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
    });
  }

  StudentsCompanion copyWith({
    Value<int>? id,
    Value<String>? studentIdCode,
    Value<String>? fullName,
    Value<String?>? section,
    Value<String?>? photoUrl,
    Value<PgDateTime>? createdAt,
    Value<PgDateTime>? updatedAt,
  }) {
    return StudentsCompanion(
      id: id ?? this.id,
      studentIdCode: studentIdCode ?? this.studentIdCode,
      fullName: fullName ?? this.fullName,
      section: section ?? this.section,
      photoUrl: photoUrl ?? this.photoUrl,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (studentIdCode.present) {
      map['student_id_code'] = Variable<String>(studentIdCode.value);
    }
    if (fullName.present) {
      map['full_name'] = Variable<String>(fullName.value);
    }
    if (section.present) {
      map['section'] = Variable<String>(section.value);
    }
    if (photoUrl.present) {
      map['photo_url'] = Variable<String>(photoUrl.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<PgDateTime>(createdAt.value, pgTimestamp);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<PgDateTime>(updatedAt.value, pgTimestamp);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('StudentsCompanion(')
          ..write('id: $id, ')
          ..write('studentIdCode: $studentIdCode, ')
          ..write('fullName: $fullName, ')
          ..write('section: $section, ')
          ..write('photoUrl: $photoUrl, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }
}

class $EventsTable extends Events with TableInfo<$EventsTable, Event> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $EventsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _eventDateMeta = const VerificationMeta(
    'eventDate',
  );
  @override
  late final GeneratedColumn<PgDateTime> eventDate =
      GeneratedColumn<PgDateTime>(
        'event_date',
        aliasedName,
        false,
        type: pgTimestamp,
        requiredDuringInsert: true,
      );
  static const VerificationMeta _isActiveMeta = const VerificationMeta(
    'isActive',
  );
  @override
  late final GeneratedColumn<bool> isActive = GeneratedColumn<bool>(
    'is_active',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintsDependsOnDialect({
      SqlDialect.sqlite: 'CHECK ("is_active" IN (0, 1))',
      SqlDialect.postgres: '',
    }),
    defaultValue: const Constant(true),
  );
  static const VerificationMeta _createdByMeta = const VerificationMeta(
    'createdBy',
  );
  @override
  late final GeneratedColumn<int> createdBy = GeneratedColumn<int>(
    'created_by',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES users (id)',
    ),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<PgDateTime> createdAt =
      GeneratedColumn<PgDateTime>(
        'created_at',
        aliasedName,
        false,
        type: pgTimestamp,
        requiredDuringInsert: false,
        clientDefault: pgNow,
      );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<PgDateTime> updatedAt =
      GeneratedColumn<PgDateTime>(
        'updated_at',
        aliasedName,
        false,
        type: pgTimestamp,
        requiredDuringInsert: false,
        clientDefault: pgNow,
      );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    name,
    eventDate,
    isActive,
    createdBy,
    createdAt,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'events';
  @override
  VerificationContext validateIntegrity(
    Insertable<Event> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('event_date')) {
      context.handle(
        _eventDateMeta,
        eventDate.isAcceptableOrUnknown(data['event_date']!, _eventDateMeta),
      );
    } else if (isInserting) {
      context.missing(_eventDateMeta);
    }
    if (data.containsKey('is_active')) {
      context.handle(
        _isActiveMeta,
        isActive.isAcceptableOrUnknown(data['is_active']!, _isActiveMeta),
      );
    }
    if (data.containsKey('created_by')) {
      context.handle(
        _createdByMeta,
        createdBy.isAcceptableOrUnknown(data['created_by']!, _createdByMeta),
      );
    } else if (isInserting) {
      context.missing(_createdByMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Event map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Event(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      eventDate: attachedDatabase.typeMapping.read(
        pgTimestamp,
        data['${effectivePrefix}event_date'],
      )!,
      isActive: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_active'],
      )!,
      createdBy: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_by'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        pgTimestamp,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        pgTimestamp,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $EventsTable createAlias(String alias) {
    return $EventsTable(attachedDatabase, alias);
  }
}

class Event extends DataClass implements Insertable<Event> {
  final int id;
  final String name;
  final PgDateTime eventDate;
  final bool isActive;
  final int createdBy;
  final PgDateTime createdAt;
  final PgDateTime updatedAt;
  const Event({
    required this.id,
    required this.name,
    required this.eventDate,
    required this.isActive,
    required this.createdBy,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['name'] = Variable<String>(name);
    map['event_date'] = Variable<PgDateTime>(eventDate, pgTimestamp);
    map['is_active'] = Variable<bool>(isActive);
    map['created_by'] = Variable<int>(createdBy);
    map['created_at'] = Variable<PgDateTime>(createdAt, pgTimestamp);
    map['updated_at'] = Variable<PgDateTime>(updatedAt, pgTimestamp);
    return map;
  }

  EventsCompanion toCompanion(bool nullToAbsent) {
    return EventsCompanion(
      id: Value(id),
      name: Value(name),
      eventDate: Value(eventDate),
      isActive: Value(isActive),
      createdBy: Value(createdBy),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory Event.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Event(
      id: serializer.fromJson<int>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      eventDate: serializer.fromJson<PgDateTime>(json['eventDate']),
      isActive: serializer.fromJson<bool>(json['isActive']),
      createdBy: serializer.fromJson<int>(json['createdBy']),
      createdAt: serializer.fromJson<PgDateTime>(json['createdAt']),
      updatedAt: serializer.fromJson<PgDateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'name': serializer.toJson<String>(name),
      'eventDate': serializer.toJson<PgDateTime>(eventDate),
      'isActive': serializer.toJson<bool>(isActive),
      'createdBy': serializer.toJson<int>(createdBy),
      'createdAt': serializer.toJson<PgDateTime>(createdAt),
      'updatedAt': serializer.toJson<PgDateTime>(updatedAt),
    };
  }

  Event copyWith({
    int? id,
    String? name,
    PgDateTime? eventDate,
    bool? isActive,
    int? createdBy,
    PgDateTime? createdAt,
    PgDateTime? updatedAt,
  }) => Event(
    id: id ?? this.id,
    name: name ?? this.name,
    eventDate: eventDate ?? this.eventDate,
    isActive: isActive ?? this.isActive,
    createdBy: createdBy ?? this.createdBy,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  Event copyWithCompanion(EventsCompanion data) {
    return Event(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      eventDate: data.eventDate.present ? data.eventDate.value : this.eventDate,
      isActive: data.isActive.present ? data.isActive.value : this.isActive,
      createdBy: data.createdBy.present ? data.createdBy.value : this.createdBy,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Event(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('eventDate: $eventDate, ')
          ..write('isActive: $isActive, ')
          ..write('createdBy: $createdBy, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    name,
    eventDate,
    isActive,
    createdBy,
    createdAt,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Event &&
          other.id == this.id &&
          other.name == this.name &&
          other.eventDate == this.eventDate &&
          other.isActive == this.isActive &&
          other.createdBy == this.createdBy &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class EventsCompanion extends UpdateCompanion<Event> {
  final Value<int> id;
  final Value<String> name;
  final Value<PgDateTime> eventDate;
  final Value<bool> isActive;
  final Value<int> createdBy;
  final Value<PgDateTime> createdAt;
  final Value<PgDateTime> updatedAt;
  const EventsCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.eventDate = const Value.absent(),
    this.isActive = const Value.absent(),
    this.createdBy = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
  });
  EventsCompanion.insert({
    this.id = const Value.absent(),
    required String name,
    required PgDateTime eventDate,
    this.isActive = const Value.absent(),
    required int createdBy,
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
  }) : name = Value(name),
       eventDate = Value(eventDate),
       createdBy = Value(createdBy);
  static Insertable<Event> custom({
    Expression<int>? id,
    Expression<String>? name,
    Expression<PgDateTime>? eventDate,
    Expression<bool>? isActive,
    Expression<int>? createdBy,
    Expression<PgDateTime>? createdAt,
    Expression<PgDateTime>? updatedAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (eventDate != null) 'event_date': eventDate,
      if (isActive != null) 'is_active': isActive,
      if (createdBy != null) 'created_by': createdBy,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
    });
  }

  EventsCompanion copyWith({
    Value<int>? id,
    Value<String>? name,
    Value<PgDateTime>? eventDate,
    Value<bool>? isActive,
    Value<int>? createdBy,
    Value<PgDateTime>? createdAt,
    Value<PgDateTime>? updatedAt,
  }) {
    return EventsCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      eventDate: eventDate ?? this.eventDate,
      isActive: isActive ?? this.isActive,
      createdBy: createdBy ?? this.createdBy,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (eventDate.present) {
      map['event_date'] = Variable<PgDateTime>(eventDate.value, pgTimestamp);
    }
    if (isActive.present) {
      map['is_active'] = Variable<bool>(isActive.value);
    }
    if (createdBy.present) {
      map['created_by'] = Variable<int>(createdBy.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<PgDateTime>(createdAt.value, pgTimestamp);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<PgDateTime>(updatedAt.value, pgTimestamp);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('EventsCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('eventDate: $eventDate, ')
          ..write('isActive: $isActive, ')
          ..write('createdBy: $createdBy, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }
}

class $SessionWindowsTable extends SessionWindows
    with TableInfo<$SessionWindowsTable, SessionWindow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SessionWindowsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _eventIdMeta = const VerificationMeta(
    'eventId',
  );
  @override
  late final GeneratedColumn<int> eventId = GeneratedColumn<int>(
    'event_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES events (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _sessionLabelMeta = const VerificationMeta(
    'sessionLabel',
  );
  @override
  late final GeneratedColumn<String> sessionLabel = GeneratedColumn<String>(
    'session_label',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _startTimeMeta = const VerificationMeta(
    'startTime',
  );
  @override
  late final GeneratedColumn<String> startTime = GeneratedColumn<String>(
    'start_time',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _endTimeMeta = const VerificationMeta(
    'endTime',
  );
  @override
  late final GeneratedColumn<String> endTime = GeneratedColumn<String>(
    'end_time',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sortOrderMeta = const VerificationMeta(
    'sortOrder',
  );
  @override
  late final GeneratedColumn<int> sortOrder = GeneratedColumn<int>(
    'sort_order',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    eventId,
    sessionLabel,
    startTime,
    endTime,
    sortOrder,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'session_windows';
  @override
  VerificationContext validateIntegrity(
    Insertable<SessionWindow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('event_id')) {
      context.handle(
        _eventIdMeta,
        eventId.isAcceptableOrUnknown(data['event_id']!, _eventIdMeta),
      );
    } else if (isInserting) {
      context.missing(_eventIdMeta);
    }
    if (data.containsKey('session_label')) {
      context.handle(
        _sessionLabelMeta,
        sessionLabel.isAcceptableOrUnknown(
          data['session_label']!,
          _sessionLabelMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_sessionLabelMeta);
    }
    if (data.containsKey('start_time')) {
      context.handle(
        _startTimeMeta,
        startTime.isAcceptableOrUnknown(data['start_time']!, _startTimeMeta),
      );
    } else if (isInserting) {
      context.missing(_startTimeMeta);
    }
    if (data.containsKey('end_time')) {
      context.handle(
        _endTimeMeta,
        endTime.isAcceptableOrUnknown(data['end_time']!, _endTimeMeta),
      );
    } else if (isInserting) {
      context.missing(_endTimeMeta);
    }
    if (data.containsKey('sort_order')) {
      context.handle(
        _sortOrderMeta,
        sortOrder.isAcceptableOrUnknown(data['sort_order']!, _sortOrderMeta),
      );
    } else if (isInserting) {
      context.missing(_sortOrderMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  SessionWindow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SessionWindow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      eventId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}event_id'],
      )!,
      sessionLabel: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}session_label'],
      )!,
      startTime: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}start_time'],
      )!,
      endTime: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}end_time'],
      )!,
      sortOrder: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}sort_order'],
      )!,
    );
  }

  @override
  $SessionWindowsTable createAlias(String alias) {
    return $SessionWindowsTable(attachedDatabase, alias);
  }
}

class SessionWindow extends DataClass implements Insertable<SessionWindow> {
  final int id;
  final int eventId;

  /// "Morning" / "Afternoon" — admin can rename/add more.
  final String sessionLabel;

  /// Stored as "HH:mm"; compared as minutes since midnight.
  final String startTime;
  final String endTime;
  final int sortOrder;
  const SessionWindow({
    required this.id,
    required this.eventId,
    required this.sessionLabel,
    required this.startTime,
    required this.endTime,
    required this.sortOrder,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['event_id'] = Variable<int>(eventId);
    map['session_label'] = Variable<String>(sessionLabel);
    map['start_time'] = Variable<String>(startTime);
    map['end_time'] = Variable<String>(endTime);
    map['sort_order'] = Variable<int>(sortOrder);
    return map;
  }

  SessionWindowsCompanion toCompanion(bool nullToAbsent) {
    return SessionWindowsCompanion(
      id: Value(id),
      eventId: Value(eventId),
      sessionLabel: Value(sessionLabel),
      startTime: Value(startTime),
      endTime: Value(endTime),
      sortOrder: Value(sortOrder),
    );
  }

  factory SessionWindow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SessionWindow(
      id: serializer.fromJson<int>(json['id']),
      eventId: serializer.fromJson<int>(json['eventId']),
      sessionLabel: serializer.fromJson<String>(json['sessionLabel']),
      startTime: serializer.fromJson<String>(json['startTime']),
      endTime: serializer.fromJson<String>(json['endTime']),
      sortOrder: serializer.fromJson<int>(json['sortOrder']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'eventId': serializer.toJson<int>(eventId),
      'sessionLabel': serializer.toJson<String>(sessionLabel),
      'startTime': serializer.toJson<String>(startTime),
      'endTime': serializer.toJson<String>(endTime),
      'sortOrder': serializer.toJson<int>(sortOrder),
    };
  }

  SessionWindow copyWith({
    int? id,
    int? eventId,
    String? sessionLabel,
    String? startTime,
    String? endTime,
    int? sortOrder,
  }) => SessionWindow(
    id: id ?? this.id,
    eventId: eventId ?? this.eventId,
    sessionLabel: sessionLabel ?? this.sessionLabel,
    startTime: startTime ?? this.startTime,
    endTime: endTime ?? this.endTime,
    sortOrder: sortOrder ?? this.sortOrder,
  );
  SessionWindow copyWithCompanion(SessionWindowsCompanion data) {
    return SessionWindow(
      id: data.id.present ? data.id.value : this.id,
      eventId: data.eventId.present ? data.eventId.value : this.eventId,
      sessionLabel: data.sessionLabel.present
          ? data.sessionLabel.value
          : this.sessionLabel,
      startTime: data.startTime.present ? data.startTime.value : this.startTime,
      endTime: data.endTime.present ? data.endTime.value : this.endTime,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SessionWindow(')
          ..write('id: $id, ')
          ..write('eventId: $eventId, ')
          ..write('sessionLabel: $sessionLabel, ')
          ..write('startTime: $startTime, ')
          ..write('endTime: $endTime, ')
          ..write('sortOrder: $sortOrder')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, eventId, sessionLabel, startTime, endTime, sortOrder);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SessionWindow &&
          other.id == this.id &&
          other.eventId == this.eventId &&
          other.sessionLabel == this.sessionLabel &&
          other.startTime == this.startTime &&
          other.endTime == this.endTime &&
          other.sortOrder == this.sortOrder);
}

class SessionWindowsCompanion extends UpdateCompanion<SessionWindow> {
  final Value<int> id;
  final Value<int> eventId;
  final Value<String> sessionLabel;
  final Value<String> startTime;
  final Value<String> endTime;
  final Value<int> sortOrder;
  const SessionWindowsCompanion({
    this.id = const Value.absent(),
    this.eventId = const Value.absent(),
    this.sessionLabel = const Value.absent(),
    this.startTime = const Value.absent(),
    this.endTime = const Value.absent(),
    this.sortOrder = const Value.absent(),
  });
  SessionWindowsCompanion.insert({
    this.id = const Value.absent(),
    required int eventId,
    required String sessionLabel,
    required String startTime,
    required String endTime,
    required int sortOrder,
  }) : eventId = Value(eventId),
       sessionLabel = Value(sessionLabel),
       startTime = Value(startTime),
       endTime = Value(endTime),
       sortOrder = Value(sortOrder);
  static Insertable<SessionWindow> custom({
    Expression<int>? id,
    Expression<int>? eventId,
    Expression<String>? sessionLabel,
    Expression<String>? startTime,
    Expression<String>? endTime,
    Expression<int>? sortOrder,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (eventId != null) 'event_id': eventId,
      if (sessionLabel != null) 'session_label': sessionLabel,
      if (startTime != null) 'start_time': startTime,
      if (endTime != null) 'end_time': endTime,
      if (sortOrder != null) 'sort_order': sortOrder,
    });
  }

  SessionWindowsCompanion copyWith({
    Value<int>? id,
    Value<int>? eventId,
    Value<String>? sessionLabel,
    Value<String>? startTime,
    Value<String>? endTime,
    Value<int>? sortOrder,
  }) {
    return SessionWindowsCompanion(
      id: id ?? this.id,
      eventId: eventId ?? this.eventId,
      sessionLabel: sessionLabel ?? this.sessionLabel,
      startTime: startTime ?? this.startTime,
      endTime: endTime ?? this.endTime,
      sortOrder: sortOrder ?? this.sortOrder,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (eventId.present) {
      map['event_id'] = Variable<int>(eventId.value);
    }
    if (sessionLabel.present) {
      map['session_label'] = Variable<String>(sessionLabel.value);
    }
    if (startTime.present) {
      map['start_time'] = Variable<String>(startTime.value);
    }
    if (endTime.present) {
      map['end_time'] = Variable<String>(endTime.value);
    }
    if (sortOrder.present) {
      map['sort_order'] = Variable<int>(sortOrder.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SessionWindowsCompanion(')
          ..write('id: $id, ')
          ..write('eventId: $eventId, ')
          ..write('sessionLabel: $sessionLabel, ')
          ..write('startTime: $startTime, ')
          ..write('endTime: $endTime, ')
          ..write('sortOrder: $sortOrder')
          ..write(')'))
        .toString();
  }
}

class $AttendanceLogsTable extends AttendanceLogs
    with TableInfo<$AttendanceLogsTable, AttendanceLog> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AttendanceLogsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _eventIdMeta = const VerificationMeta(
    'eventId',
  );
  @override
  late final GeneratedColumn<int> eventId = GeneratedColumn<int>(
    'event_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES events (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _studentIdMeta = const VerificationMeta(
    'studentId',
  );
  @override
  late final GeneratedColumn<int> studentId = GeneratedColumn<int>(
    'student_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES students (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _sessionWindowIdMeta = const VerificationMeta(
    'sessionWindowId',
  );
  @override
  late final GeneratedColumn<int> sessionWindowId = GeneratedColumn<int>(
    'session_window_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES session_windows (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _directionMeta = const VerificationMeta(
    'direction',
  );
  @override
  late final GeneratedColumn<String> direction = GeneratedColumn<String>(
    'direction',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _scannedAtMeta = const VerificationMeta(
    'scannedAt',
  );
  @override
  late final GeneratedColumn<PgDateTime> scannedAt =
      GeneratedColumn<PgDateTime>(
        'scanned_at',
        aliasedName,
        false,
        type: pgTimestamp,
        requiredDuringInsert: false,
        clientDefault: pgNow,
      );
  static const VerificationMeta _scannedByMeta = const VerificationMeta(
    'scannedBy',
  );
  @override
  late final GeneratedColumn<int> scannedBy = GeneratedColumn<int>(
    'scanned_by',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES users (id)',
    ),
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _deviceNoteMeta = const VerificationMeta(
    'deviceNote',
  );
  @override
  late final GeneratedColumn<String> deviceNote = GeneratedColumn<String>(
    'device_note',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<PgDateTime> updatedAt =
      GeneratedColumn<PgDateTime>(
        'updated_at',
        aliasedName,
        false,
        type: pgTimestamp,
        requiredDuringInsert: false,
        clientDefault: pgNow,
      );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    eventId,
    studentId,
    sessionWindowId,
    direction,
    scannedAt,
    scannedBy,
    status,
    deviceNote,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'attendance_logs';
  @override
  VerificationContext validateIntegrity(
    Insertable<AttendanceLog> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('event_id')) {
      context.handle(
        _eventIdMeta,
        eventId.isAcceptableOrUnknown(data['event_id']!, _eventIdMeta),
      );
    } else if (isInserting) {
      context.missing(_eventIdMeta);
    }
    if (data.containsKey('student_id')) {
      context.handle(
        _studentIdMeta,
        studentId.isAcceptableOrUnknown(data['student_id']!, _studentIdMeta),
      );
    } else if (isInserting) {
      context.missing(_studentIdMeta);
    }
    if (data.containsKey('session_window_id')) {
      context.handle(
        _sessionWindowIdMeta,
        sessionWindowId.isAcceptableOrUnknown(
          data['session_window_id']!,
          _sessionWindowIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_sessionWindowIdMeta);
    }
    if (data.containsKey('direction')) {
      context.handle(
        _directionMeta,
        direction.isAcceptableOrUnknown(data['direction']!, _directionMeta),
      );
    } else if (isInserting) {
      context.missing(_directionMeta);
    }
    if (data.containsKey('scanned_at')) {
      context.handle(
        _scannedAtMeta,
        scannedAt.isAcceptableOrUnknown(data['scanned_at']!, _scannedAtMeta),
      );
    }
    if (data.containsKey('scanned_by')) {
      context.handle(
        _scannedByMeta,
        scannedBy.isAcceptableOrUnknown(data['scanned_by']!, _scannedByMeta),
      );
    } else if (isInserting) {
      context.missing(_scannedByMeta);
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('device_note')) {
      context.handle(
        _deviceNoteMeta,
        deviceNote.isAcceptableOrUnknown(data['device_note']!, _deviceNoteMeta),
      );
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  AttendanceLog map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return AttendanceLog(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      eventId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}event_id'],
      )!,
      studentId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}student_id'],
      )!,
      sessionWindowId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}session_window_id'],
      )!,
      direction: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}direction'],
      )!,
      scannedAt: attachedDatabase.typeMapping.read(
        pgTimestamp,
        data['${effectivePrefix}scanned_at'],
      )!,
      scannedBy: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}scanned_by'],
      )!,
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      deviceNote: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}device_note'],
      ),
      updatedAt: attachedDatabase.typeMapping.read(
        pgTimestamp,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $AttendanceLogsTable createAlias(String alias) {
    return $AttendanceLogsTable(attachedDatabase, alias);
  }
}

class AttendanceLog extends DataClass implements Insertable<AttendanceLog> {
  final int id;
  final int eventId;
  final int studentId;
  final int sessionWindowId;

  /// 'IN' | 'OUT' — auto-computed server-side.
  final String direction;
  final PgDateTime scannedAt;

  /// The moderator who scanned.
  final int scannedBy;

  /// 'confirmed' | 'cancelled'
  final String status;
  final String? deviceNote;
  final PgDateTime updatedAt;
  const AttendanceLog({
    required this.id,
    required this.eventId,
    required this.studentId,
    required this.sessionWindowId,
    required this.direction,
    required this.scannedAt,
    required this.scannedBy,
    required this.status,
    this.deviceNote,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['event_id'] = Variable<int>(eventId);
    map['student_id'] = Variable<int>(studentId);
    map['session_window_id'] = Variable<int>(sessionWindowId);
    map['direction'] = Variable<String>(direction);
    map['scanned_at'] = Variable<PgDateTime>(scannedAt, pgTimestamp);
    map['scanned_by'] = Variable<int>(scannedBy);
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || deviceNote != null) {
      map['device_note'] = Variable<String>(deviceNote);
    }
    map['updated_at'] = Variable<PgDateTime>(updatedAt, pgTimestamp);
    return map;
  }

  AttendanceLogsCompanion toCompanion(bool nullToAbsent) {
    return AttendanceLogsCompanion(
      id: Value(id),
      eventId: Value(eventId),
      studentId: Value(studentId),
      sessionWindowId: Value(sessionWindowId),
      direction: Value(direction),
      scannedAt: Value(scannedAt),
      scannedBy: Value(scannedBy),
      status: Value(status),
      deviceNote: deviceNote == null && nullToAbsent
          ? const Value.absent()
          : Value(deviceNote),
      updatedAt: Value(updatedAt),
    );
  }

  factory AttendanceLog.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return AttendanceLog(
      id: serializer.fromJson<int>(json['id']),
      eventId: serializer.fromJson<int>(json['eventId']),
      studentId: serializer.fromJson<int>(json['studentId']),
      sessionWindowId: serializer.fromJson<int>(json['sessionWindowId']),
      direction: serializer.fromJson<String>(json['direction']),
      scannedAt: serializer.fromJson<PgDateTime>(json['scannedAt']),
      scannedBy: serializer.fromJson<int>(json['scannedBy']),
      status: serializer.fromJson<String>(json['status']),
      deviceNote: serializer.fromJson<String?>(json['deviceNote']),
      updatedAt: serializer.fromJson<PgDateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'eventId': serializer.toJson<int>(eventId),
      'studentId': serializer.toJson<int>(studentId),
      'sessionWindowId': serializer.toJson<int>(sessionWindowId),
      'direction': serializer.toJson<String>(direction),
      'scannedAt': serializer.toJson<PgDateTime>(scannedAt),
      'scannedBy': serializer.toJson<int>(scannedBy),
      'status': serializer.toJson<String>(status),
      'deviceNote': serializer.toJson<String?>(deviceNote),
      'updatedAt': serializer.toJson<PgDateTime>(updatedAt),
    };
  }

  AttendanceLog copyWith({
    int? id,
    int? eventId,
    int? studentId,
    int? sessionWindowId,
    String? direction,
    PgDateTime? scannedAt,
    int? scannedBy,
    String? status,
    Value<String?> deviceNote = const Value.absent(),
    PgDateTime? updatedAt,
  }) => AttendanceLog(
    id: id ?? this.id,
    eventId: eventId ?? this.eventId,
    studentId: studentId ?? this.studentId,
    sessionWindowId: sessionWindowId ?? this.sessionWindowId,
    direction: direction ?? this.direction,
    scannedAt: scannedAt ?? this.scannedAt,
    scannedBy: scannedBy ?? this.scannedBy,
    status: status ?? this.status,
    deviceNote: deviceNote.present ? deviceNote.value : this.deviceNote,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  AttendanceLog copyWithCompanion(AttendanceLogsCompanion data) {
    return AttendanceLog(
      id: data.id.present ? data.id.value : this.id,
      eventId: data.eventId.present ? data.eventId.value : this.eventId,
      studentId: data.studentId.present ? data.studentId.value : this.studentId,
      sessionWindowId: data.sessionWindowId.present
          ? data.sessionWindowId.value
          : this.sessionWindowId,
      direction: data.direction.present ? data.direction.value : this.direction,
      scannedAt: data.scannedAt.present ? data.scannedAt.value : this.scannedAt,
      scannedBy: data.scannedBy.present ? data.scannedBy.value : this.scannedBy,
      status: data.status.present ? data.status.value : this.status,
      deviceNote: data.deviceNote.present
          ? data.deviceNote.value
          : this.deviceNote,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('AttendanceLog(')
          ..write('id: $id, ')
          ..write('eventId: $eventId, ')
          ..write('studentId: $studentId, ')
          ..write('sessionWindowId: $sessionWindowId, ')
          ..write('direction: $direction, ')
          ..write('scannedAt: $scannedAt, ')
          ..write('scannedBy: $scannedBy, ')
          ..write('status: $status, ')
          ..write('deviceNote: $deviceNote, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    eventId,
    studentId,
    sessionWindowId,
    direction,
    scannedAt,
    scannedBy,
    status,
    deviceNote,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is AttendanceLog &&
          other.id == this.id &&
          other.eventId == this.eventId &&
          other.studentId == this.studentId &&
          other.sessionWindowId == this.sessionWindowId &&
          other.direction == this.direction &&
          other.scannedAt == this.scannedAt &&
          other.scannedBy == this.scannedBy &&
          other.status == this.status &&
          other.deviceNote == this.deviceNote &&
          other.updatedAt == this.updatedAt);
}

class AttendanceLogsCompanion extends UpdateCompanion<AttendanceLog> {
  final Value<int> id;
  final Value<int> eventId;
  final Value<int> studentId;
  final Value<int> sessionWindowId;
  final Value<String> direction;
  final Value<PgDateTime> scannedAt;
  final Value<int> scannedBy;
  final Value<String> status;
  final Value<String?> deviceNote;
  final Value<PgDateTime> updatedAt;
  const AttendanceLogsCompanion({
    this.id = const Value.absent(),
    this.eventId = const Value.absent(),
    this.studentId = const Value.absent(),
    this.sessionWindowId = const Value.absent(),
    this.direction = const Value.absent(),
    this.scannedAt = const Value.absent(),
    this.scannedBy = const Value.absent(),
    this.status = const Value.absent(),
    this.deviceNote = const Value.absent(),
    this.updatedAt = const Value.absent(),
  });
  AttendanceLogsCompanion.insert({
    this.id = const Value.absent(),
    required int eventId,
    required int studentId,
    required int sessionWindowId,
    required String direction,
    this.scannedAt = const Value.absent(),
    required int scannedBy,
    required String status,
    this.deviceNote = const Value.absent(),
    this.updatedAt = const Value.absent(),
  }) : eventId = Value(eventId),
       studentId = Value(studentId),
       sessionWindowId = Value(sessionWindowId),
       direction = Value(direction),
       scannedBy = Value(scannedBy),
       status = Value(status);
  static Insertable<AttendanceLog> custom({
    Expression<int>? id,
    Expression<int>? eventId,
    Expression<int>? studentId,
    Expression<int>? sessionWindowId,
    Expression<String>? direction,
    Expression<PgDateTime>? scannedAt,
    Expression<int>? scannedBy,
    Expression<String>? status,
    Expression<String>? deviceNote,
    Expression<PgDateTime>? updatedAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (eventId != null) 'event_id': eventId,
      if (studentId != null) 'student_id': studentId,
      if (sessionWindowId != null) 'session_window_id': sessionWindowId,
      if (direction != null) 'direction': direction,
      if (scannedAt != null) 'scanned_at': scannedAt,
      if (scannedBy != null) 'scanned_by': scannedBy,
      if (status != null) 'status': status,
      if (deviceNote != null) 'device_note': deviceNote,
      if (updatedAt != null) 'updated_at': updatedAt,
    });
  }

  AttendanceLogsCompanion copyWith({
    Value<int>? id,
    Value<int>? eventId,
    Value<int>? studentId,
    Value<int>? sessionWindowId,
    Value<String>? direction,
    Value<PgDateTime>? scannedAt,
    Value<int>? scannedBy,
    Value<String>? status,
    Value<String?>? deviceNote,
    Value<PgDateTime>? updatedAt,
  }) {
    return AttendanceLogsCompanion(
      id: id ?? this.id,
      eventId: eventId ?? this.eventId,
      studentId: studentId ?? this.studentId,
      sessionWindowId: sessionWindowId ?? this.sessionWindowId,
      direction: direction ?? this.direction,
      scannedAt: scannedAt ?? this.scannedAt,
      scannedBy: scannedBy ?? this.scannedBy,
      status: status ?? this.status,
      deviceNote: deviceNote ?? this.deviceNote,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (eventId.present) {
      map['event_id'] = Variable<int>(eventId.value);
    }
    if (studentId.present) {
      map['student_id'] = Variable<int>(studentId.value);
    }
    if (sessionWindowId.present) {
      map['session_window_id'] = Variable<int>(sessionWindowId.value);
    }
    if (direction.present) {
      map['direction'] = Variable<String>(direction.value);
    }
    if (scannedAt.present) {
      map['scanned_at'] = Variable<PgDateTime>(scannedAt.value, pgTimestamp);
    }
    if (scannedBy.present) {
      map['scanned_by'] = Variable<int>(scannedBy.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (deviceNote.present) {
      map['device_note'] = Variable<String>(deviceNote.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<PgDateTime>(updatedAt.value, pgTimestamp);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AttendanceLogsCompanion(')
          ..write('id: $id, ')
          ..write('eventId: $eventId, ')
          ..write('studentId: $studentId, ')
          ..write('sessionWindowId: $sessionWindowId, ')
          ..write('direction: $direction, ')
          ..write('scannedAt: $scannedAt, ')
          ..write('scannedBy: $scannedBy, ')
          ..write('status: $status, ')
          ..write('deviceNote: $deviceNote, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $UsersTable users = $UsersTable(this);
  late final $StudentsTable students = $StudentsTable(this);
  late final $EventsTable events = $EventsTable(this);
  late final $SessionWindowsTable sessionWindows = $SessionWindowsTable(this);
  late final $AttendanceLogsTable attendanceLogs = $AttendanceLogsTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    users,
    students,
    events,
    sessionWindows,
    attendanceLogs,
  ];
  @override
  StreamQueryUpdateRules get streamUpdateRules => const StreamQueryUpdateRules([
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'events',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('session_windows', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'events',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('attendance_logs', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'students',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('attendance_logs', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'session_windows',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('attendance_logs', kind: UpdateKind.delete)],
    ),
  ]);
}

typedef $$UsersTableCreateCompanionBuilder =
    UsersCompanion Function({
      Value<int> id,
      required String name,
      required String username,
      required String passwordHash,
      required String role,
      Value<PgDateTime> createdAt,
      Value<PgDateTime> updatedAt,
    });
typedef $$UsersTableUpdateCompanionBuilder =
    UsersCompanion Function({
      Value<int> id,
      Value<String> name,
      Value<String> username,
      Value<String> passwordHash,
      Value<String> role,
      Value<PgDateTime> createdAt,
      Value<PgDateTime> updatedAt,
    });

final class $$UsersTableReferences
    extends BaseReferences<_$AppDatabase, $UsersTable, User> {
  $$UsersTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$EventsTable, List<Event>> _eventsRefsTable(
    _$AppDatabase db,
  ) => MultiTypedResultKey.fromTable(
    db.events,
    aliasName: 'users__id__events__created_by',
  );

  $$EventsTableProcessedTableManager get eventsRefs {
    final manager = $$EventsTableTableManager(
      $_db,
      $_db.events,
    ).filter((f) => f.createdBy.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_eventsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$AttendanceLogsTable, List<AttendanceLog>>
  _attendanceLogsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.attendanceLogs,
    aliasName: 'users__id__attendance_logs__scanned_by',
  );

  $$AttendanceLogsTableProcessedTableManager get attendanceLogsRefs {
    final manager = $$AttendanceLogsTableTableManager(
      $_db,
      $_db.attendanceLogs,
    ).filter((f) => f.scannedBy.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_attendanceLogsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$UsersTableFilterComposer extends Composer<_$AppDatabase, $UsersTable> {
  $$UsersTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get username => $composableBuilder(
    column: $table.username,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get passwordHash => $composableBuilder(
    column: $table.passwordHash,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get role => $composableBuilder(
    column: $table.role,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<PgDateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<PgDateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> eventsRefs(
    Expression<bool> Function($$EventsTableFilterComposer f) f,
  ) {
    final $$EventsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.events,
      getReferencedColumn: (t) => t.createdBy,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$EventsTableFilterComposer(
            $db: $db,
            $table: $db.events,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> attendanceLogsRefs(
    Expression<bool> Function($$AttendanceLogsTableFilterComposer f) f,
  ) {
    final $$AttendanceLogsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.attendanceLogs,
      getReferencedColumn: (t) => t.scannedBy,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$AttendanceLogsTableFilterComposer(
            $db: $db,
            $table: $db.attendanceLogs,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$UsersTableOrderingComposer
    extends Composer<_$AppDatabase, $UsersTable> {
  $$UsersTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get username => $composableBuilder(
    column: $table.username,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get passwordHash => $composableBuilder(
    column: $table.passwordHash,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get role => $composableBuilder(
    column: $table.role,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<PgDateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<PgDateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$UsersTableAnnotationComposer
    extends Composer<_$AppDatabase, $UsersTable> {
  $$UsersTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get username =>
      $composableBuilder(column: $table.username, builder: (column) => column);

  GeneratedColumn<String> get passwordHash => $composableBuilder(
    column: $table.passwordHash,
    builder: (column) => column,
  );

  GeneratedColumn<String> get role =>
      $composableBuilder(column: $table.role, builder: (column) => column);

  GeneratedColumn<PgDateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<PgDateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  Expression<T> eventsRefs<T extends Object>(
    Expression<T> Function($$EventsTableAnnotationComposer a) f,
  ) {
    final $$EventsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.events,
      getReferencedColumn: (t) => t.createdBy,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$EventsTableAnnotationComposer(
            $db: $db,
            $table: $db.events,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> attendanceLogsRefs<T extends Object>(
    Expression<T> Function($$AttendanceLogsTableAnnotationComposer a) f,
  ) {
    final $$AttendanceLogsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.attendanceLogs,
      getReferencedColumn: (t) => t.scannedBy,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$AttendanceLogsTableAnnotationComposer(
            $db: $db,
            $table: $db.attendanceLogs,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$UsersTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $UsersTable,
          User,
          $$UsersTableFilterComposer,
          $$UsersTableOrderingComposer,
          $$UsersTableAnnotationComposer,
          $$UsersTableCreateCompanionBuilder,
          $$UsersTableUpdateCompanionBuilder,
          (User, $$UsersTableReferences),
          User,
          PrefetchHooks Function({bool eventsRefs, bool attendanceLogsRefs})
        > {
  $$UsersTableTableManager(_$AppDatabase db, $UsersTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$UsersTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$UsersTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$UsersTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> username = const Value.absent(),
                Value<String> passwordHash = const Value.absent(),
                Value<String> role = const Value.absent(),
                Value<PgDateTime> createdAt = const Value.absent(),
                Value<PgDateTime> updatedAt = const Value.absent(),
              }) => UsersCompanion(
                id: id,
                name: name,
                username: username,
                passwordHash: passwordHash,
                role: role,
                createdAt: createdAt,
                updatedAt: updatedAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String name,
                required String username,
                required String passwordHash,
                required String role,
                Value<PgDateTime> createdAt = const Value.absent(),
                Value<PgDateTime> updatedAt = const Value.absent(),
              }) => UsersCompanion.insert(
                id: id,
                name: name,
                username: username,
                passwordHash: passwordHash,
                role: role,
                createdAt: createdAt,
                updatedAt: updatedAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$UsersTable, User>(table),
                  $$UsersTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback:
              ({eventsRefs = false, attendanceLogsRefs = false}) {
                return PrefetchHooks(
                  db: db,
                  explicitlyWatchedTables: [
                    if (eventsRefs) db.events,
                    if (attendanceLogsRefs) db.attendanceLogs,
                  ],
                  addJoins: null,
                  getPrefetchedDataCallback: (items) async {
                    return [
                      if (eventsRefs)
                        await $_getPrefetchedData<User, $UsersTable, Event>(
                          currentTable: table,
                          referencedTable: $$UsersTableReferences
                              ._eventsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$UsersTableReferences(db, table, p0).eventsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.createdBy == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (attendanceLogsRefs)
                        await $_getPrefetchedData<
                          User,
                          $UsersTable,
                          AttendanceLog
                        >(
                          currentTable: table,
                          referencedTable: $$UsersTableReferences
                              ._attendanceLogsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$UsersTableReferences(
                                db,
                                table,
                                p0,
                              ).attendanceLogsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.scannedBy == item.id,
                              ),
                          typedResults: items,
                        ),
                    ];
                  },
                );
              },
        ),
      );
}

typedef $$UsersTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $UsersTable,
      User,
      $$UsersTableFilterComposer,
      $$UsersTableOrderingComposer,
      $$UsersTableAnnotationComposer,
      $$UsersTableCreateCompanionBuilder,
      $$UsersTableUpdateCompanionBuilder,
      (User, $$UsersTableReferences),
      User,
      PrefetchHooks Function({bool eventsRefs, bool attendanceLogsRefs})
    >;
typedef $$StudentsTableCreateCompanionBuilder =
    StudentsCompanion Function({
      Value<int> id,
      required String studentIdCode,
      required String fullName,
      Value<String?> section,
      Value<String?> photoUrl,
      Value<PgDateTime> createdAt,
      Value<PgDateTime> updatedAt,
    });
typedef $$StudentsTableUpdateCompanionBuilder =
    StudentsCompanion Function({
      Value<int> id,
      Value<String> studentIdCode,
      Value<String> fullName,
      Value<String?> section,
      Value<String?> photoUrl,
      Value<PgDateTime> createdAt,
      Value<PgDateTime> updatedAt,
    });

final class $$StudentsTableReferences
    extends BaseReferences<_$AppDatabase, $StudentsTable, Student> {
  $$StudentsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$AttendanceLogsTable, List<AttendanceLog>>
  _attendanceLogsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.attendanceLogs,
    aliasName: 'students__id__attendance_logs__student_id',
  );

  $$AttendanceLogsTableProcessedTableManager get attendanceLogsRefs {
    final manager = $$AttendanceLogsTableTableManager(
      $_db,
      $_db.attendanceLogs,
    ).filter((f) => f.studentId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_attendanceLogsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$StudentsTableFilterComposer
    extends Composer<_$AppDatabase, $StudentsTable> {
  $$StudentsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get studentIdCode => $composableBuilder(
    column: $table.studentIdCode,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get fullName => $composableBuilder(
    column: $table.fullName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get section => $composableBuilder(
    column: $table.section,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get photoUrl => $composableBuilder(
    column: $table.photoUrl,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<PgDateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<PgDateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> attendanceLogsRefs(
    Expression<bool> Function($$AttendanceLogsTableFilterComposer f) f,
  ) {
    final $$AttendanceLogsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.attendanceLogs,
      getReferencedColumn: (t) => t.studentId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$AttendanceLogsTableFilterComposer(
            $db: $db,
            $table: $db.attendanceLogs,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$StudentsTableOrderingComposer
    extends Composer<_$AppDatabase, $StudentsTable> {
  $$StudentsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get studentIdCode => $composableBuilder(
    column: $table.studentIdCode,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get fullName => $composableBuilder(
    column: $table.fullName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get section => $composableBuilder(
    column: $table.section,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get photoUrl => $composableBuilder(
    column: $table.photoUrl,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<PgDateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<PgDateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$StudentsTableAnnotationComposer
    extends Composer<_$AppDatabase, $StudentsTable> {
  $$StudentsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get studentIdCode => $composableBuilder(
    column: $table.studentIdCode,
    builder: (column) => column,
  );

  GeneratedColumn<String> get fullName =>
      $composableBuilder(column: $table.fullName, builder: (column) => column);

  GeneratedColumn<String> get section =>
      $composableBuilder(column: $table.section, builder: (column) => column);

  GeneratedColumn<String> get photoUrl =>
      $composableBuilder(column: $table.photoUrl, builder: (column) => column);

  GeneratedColumn<PgDateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<PgDateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  Expression<T> attendanceLogsRefs<T extends Object>(
    Expression<T> Function($$AttendanceLogsTableAnnotationComposer a) f,
  ) {
    final $$AttendanceLogsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.attendanceLogs,
      getReferencedColumn: (t) => t.studentId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$AttendanceLogsTableAnnotationComposer(
            $db: $db,
            $table: $db.attendanceLogs,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$StudentsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $StudentsTable,
          Student,
          $$StudentsTableFilterComposer,
          $$StudentsTableOrderingComposer,
          $$StudentsTableAnnotationComposer,
          $$StudentsTableCreateCompanionBuilder,
          $$StudentsTableUpdateCompanionBuilder,
          (Student, $$StudentsTableReferences),
          Student,
          PrefetchHooks Function({bool attendanceLogsRefs})
        > {
  $$StudentsTableTableManager(_$AppDatabase db, $StudentsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$StudentsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$StudentsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$StudentsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> studentIdCode = const Value.absent(),
                Value<String> fullName = const Value.absent(),
                Value<String?> section = const Value.absent(),
                Value<String?> photoUrl = const Value.absent(),
                Value<PgDateTime> createdAt = const Value.absent(),
                Value<PgDateTime> updatedAt = const Value.absent(),
              }) => StudentsCompanion(
                id: id,
                studentIdCode: studentIdCode,
                fullName: fullName,
                section: section,
                photoUrl: photoUrl,
                createdAt: createdAt,
                updatedAt: updatedAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String studentIdCode,
                required String fullName,
                Value<String?> section = const Value.absent(),
                Value<String?> photoUrl = const Value.absent(),
                Value<PgDateTime> createdAt = const Value.absent(),
                Value<PgDateTime> updatedAt = const Value.absent(),
              }) => StudentsCompanion.insert(
                id: id,
                studentIdCode: studentIdCode,
                fullName: fullName,
                section: section,
                photoUrl: photoUrl,
                createdAt: createdAt,
                updatedAt: updatedAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$StudentsTable, Student>(table),
                  $$StudentsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({attendanceLogsRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [
                if (attendanceLogsRefs) db.attendanceLogs,
              ],
              addJoins: null,
              getPrefetchedDataCallback: (items) async {
                return [
                  if (attendanceLogsRefs)
                    await $_getPrefetchedData<
                      Student,
                      $StudentsTable,
                      AttendanceLog
                    >(
                      currentTable: table,
                      referencedTable: $$StudentsTableReferences
                          ._attendanceLogsRefsTable(db),
                      managerFromTypedResult: (p0) => $$StudentsTableReferences(
                        db,
                        table,
                        p0,
                      ).attendanceLogsRefs,
                      referencedItemsForCurrentItem: (item, referencedItems) =>
                          referencedItems.where((e) => e.studentId == item.id),
                      typedResults: items,
                    ),
                ];
              },
            );
          },
        ),
      );
}

typedef $$StudentsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $StudentsTable,
      Student,
      $$StudentsTableFilterComposer,
      $$StudentsTableOrderingComposer,
      $$StudentsTableAnnotationComposer,
      $$StudentsTableCreateCompanionBuilder,
      $$StudentsTableUpdateCompanionBuilder,
      (Student, $$StudentsTableReferences),
      Student,
      PrefetchHooks Function({bool attendanceLogsRefs})
    >;
typedef $$EventsTableCreateCompanionBuilder =
    EventsCompanion Function({
      Value<int> id,
      required String name,
      required PgDateTime eventDate,
      Value<bool> isActive,
      required int createdBy,
      Value<PgDateTime> createdAt,
      Value<PgDateTime> updatedAt,
    });
typedef $$EventsTableUpdateCompanionBuilder =
    EventsCompanion Function({
      Value<int> id,
      Value<String> name,
      Value<PgDateTime> eventDate,
      Value<bool> isActive,
      Value<int> createdBy,
      Value<PgDateTime> createdAt,
      Value<PgDateTime> updatedAt,
    });

final class $$EventsTableReferences
    extends BaseReferences<_$AppDatabase, $EventsTable, Event> {
  $$EventsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $UsersTable _createdByTable(_$AppDatabase db) =>
      db.users.createAlias('events__created_by__users__id');

  $$UsersTableProcessedTableManager get createdBy {
    final $_column = $_itemColumn<int>('created_by')!;

    final manager = $$UsersTableTableManager(
      $_db,
      $_db.users,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_createdByTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }

  static MultiTypedResultKey<$SessionWindowsTable, List<SessionWindow>>
  _sessionWindowsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.sessionWindows,
    aliasName: 'events__id__session_windows__event_id',
  );

  $$SessionWindowsTableProcessedTableManager get sessionWindowsRefs {
    final manager = $$SessionWindowsTableTableManager(
      $_db,
      $_db.sessionWindows,
    ).filter((f) => f.eventId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_sessionWindowsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$AttendanceLogsTable, List<AttendanceLog>>
  _attendanceLogsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.attendanceLogs,
    aliasName: 'events__id__attendance_logs__event_id',
  );

  $$AttendanceLogsTableProcessedTableManager get attendanceLogsRefs {
    final manager = $$AttendanceLogsTableTableManager(
      $_db,
      $_db.attendanceLogs,
    ).filter((f) => f.eventId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_attendanceLogsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$EventsTableFilterComposer
    extends Composer<_$AppDatabase, $EventsTable> {
  $$EventsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<PgDateTime> get eventDate => $composableBuilder(
    column: $table.eventDate,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isActive => $composableBuilder(
    column: $table.isActive,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<PgDateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<PgDateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  $$UsersTableFilterComposer get createdBy {
    final $$UsersTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.createdBy,
      referencedTable: $db.users,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$UsersTableFilterComposer(
            $db: $db,
            $table: $db.users,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  Expression<bool> sessionWindowsRefs(
    Expression<bool> Function($$SessionWindowsTableFilterComposer f) f,
  ) {
    final $$SessionWindowsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.sessionWindows,
      getReferencedColumn: (t) => t.eventId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionWindowsTableFilterComposer(
            $db: $db,
            $table: $db.sessionWindows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> attendanceLogsRefs(
    Expression<bool> Function($$AttendanceLogsTableFilterComposer f) f,
  ) {
    final $$AttendanceLogsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.attendanceLogs,
      getReferencedColumn: (t) => t.eventId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$AttendanceLogsTableFilterComposer(
            $db: $db,
            $table: $db.attendanceLogs,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$EventsTableOrderingComposer
    extends Composer<_$AppDatabase, $EventsTable> {
  $$EventsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<PgDateTime> get eventDate => $composableBuilder(
    column: $table.eventDate,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isActive => $composableBuilder(
    column: $table.isActive,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<PgDateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<PgDateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );

  $$UsersTableOrderingComposer get createdBy {
    final $$UsersTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.createdBy,
      referencedTable: $db.users,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$UsersTableOrderingComposer(
            $db: $db,
            $table: $db.users,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$EventsTableAnnotationComposer
    extends Composer<_$AppDatabase, $EventsTable> {
  $$EventsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<PgDateTime> get eventDate =>
      $composableBuilder(column: $table.eventDate, builder: (column) => column);

  GeneratedColumn<bool> get isActive =>
      $composableBuilder(column: $table.isActive, builder: (column) => column);

  GeneratedColumn<PgDateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<PgDateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  $$UsersTableAnnotationComposer get createdBy {
    final $$UsersTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.createdBy,
      referencedTable: $db.users,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$UsersTableAnnotationComposer(
            $db: $db,
            $table: $db.users,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  Expression<T> sessionWindowsRefs<T extends Object>(
    Expression<T> Function($$SessionWindowsTableAnnotationComposer a) f,
  ) {
    final $$SessionWindowsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.sessionWindows,
      getReferencedColumn: (t) => t.eventId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionWindowsTableAnnotationComposer(
            $db: $db,
            $table: $db.sessionWindows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> attendanceLogsRefs<T extends Object>(
    Expression<T> Function($$AttendanceLogsTableAnnotationComposer a) f,
  ) {
    final $$AttendanceLogsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.attendanceLogs,
      getReferencedColumn: (t) => t.eventId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$AttendanceLogsTableAnnotationComposer(
            $db: $db,
            $table: $db.attendanceLogs,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$EventsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $EventsTable,
          Event,
          $$EventsTableFilterComposer,
          $$EventsTableOrderingComposer,
          $$EventsTableAnnotationComposer,
          $$EventsTableCreateCompanionBuilder,
          $$EventsTableUpdateCompanionBuilder,
          (Event, $$EventsTableReferences),
          Event,
          PrefetchHooks Function({
            bool createdBy,
            bool sessionWindowsRefs,
            bool attendanceLogsRefs,
          })
        > {
  $$EventsTableTableManager(_$AppDatabase db, $EventsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$EventsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$EventsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$EventsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<PgDateTime> eventDate = const Value.absent(),
                Value<bool> isActive = const Value.absent(),
                Value<int> createdBy = const Value.absent(),
                Value<PgDateTime> createdAt = const Value.absent(),
                Value<PgDateTime> updatedAt = const Value.absent(),
              }) => EventsCompanion(
                id: id,
                name: name,
                eventDate: eventDate,
                isActive: isActive,
                createdBy: createdBy,
                createdAt: createdAt,
                updatedAt: updatedAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String name,
                required PgDateTime eventDate,
                Value<bool> isActive = const Value.absent(),
                required int createdBy,
                Value<PgDateTime> createdAt = const Value.absent(),
                Value<PgDateTime> updatedAt = const Value.absent(),
              }) => EventsCompanion.insert(
                id: id,
                name: name,
                eventDate: eventDate,
                isActive: isActive,
                createdBy: createdBy,
                createdAt: createdAt,
                updatedAt: updatedAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$EventsTable, Event>(table),
                  $$EventsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback:
              ({
                createdBy = false,
                sessionWindowsRefs = false,
                attendanceLogsRefs = false,
              }) {
                return PrefetchHooks(
                  db: db,
                  explicitlyWatchedTables: [
                    if (sessionWindowsRefs) db.sessionWindows,
                    if (attendanceLogsRefs) db.attendanceLogs,
                  ],
                  addJoins:
                      <
                        T extends TableManagerState<
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic
                        >
                      >(state) {
                        if (createdBy) {
                          state =
                              state.withJoin(
                                    currentTable: table,
                                    currentColumn: table.createdBy,
                                    referencedTable: $$EventsTableReferences
                                        ._createdByTable(db),
                                    referencedColumn: $$EventsTableReferences
                                        ._createdByTable(db)
                                        .id,
                                  )
                                  as T;
                        }

                        return state;
                      },
                  getPrefetchedDataCallback: (items) async {
                    return [
                      if (sessionWindowsRefs)
                        await $_getPrefetchedData<
                          Event,
                          $EventsTable,
                          SessionWindow
                        >(
                          currentTable: table,
                          referencedTable: $$EventsTableReferences
                              ._sessionWindowsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$EventsTableReferences(
                                db,
                                table,
                                p0,
                              ).sessionWindowsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.eventId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (attendanceLogsRefs)
                        await $_getPrefetchedData<
                          Event,
                          $EventsTable,
                          AttendanceLog
                        >(
                          currentTable: table,
                          referencedTable: $$EventsTableReferences
                              ._attendanceLogsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$EventsTableReferences(
                                db,
                                table,
                                p0,
                              ).attendanceLogsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.eventId == item.id,
                              ),
                          typedResults: items,
                        ),
                    ];
                  },
                );
              },
        ),
      );
}

typedef $$EventsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $EventsTable,
      Event,
      $$EventsTableFilterComposer,
      $$EventsTableOrderingComposer,
      $$EventsTableAnnotationComposer,
      $$EventsTableCreateCompanionBuilder,
      $$EventsTableUpdateCompanionBuilder,
      (Event, $$EventsTableReferences),
      Event,
      PrefetchHooks Function({
        bool createdBy,
        bool sessionWindowsRefs,
        bool attendanceLogsRefs,
      })
    >;
typedef $$SessionWindowsTableCreateCompanionBuilder =
    SessionWindowsCompanion Function({
      Value<int> id,
      required int eventId,
      required String sessionLabel,
      required String startTime,
      required String endTime,
      required int sortOrder,
    });
typedef $$SessionWindowsTableUpdateCompanionBuilder =
    SessionWindowsCompanion Function({
      Value<int> id,
      Value<int> eventId,
      Value<String> sessionLabel,
      Value<String> startTime,
      Value<String> endTime,
      Value<int> sortOrder,
    });

final class $$SessionWindowsTableReferences
    extends BaseReferences<_$AppDatabase, $SessionWindowsTable, SessionWindow> {
  $$SessionWindowsTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static $EventsTable _eventIdTable(_$AppDatabase db) =>
      db.events.createAlias('session_windows__event_id__events__id');

  $$EventsTableProcessedTableManager get eventId {
    final $_column = $_itemColumn<int>('event_id')!;

    final manager = $$EventsTableTableManager(
      $_db,
      $_db.events,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_eventIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }

  static MultiTypedResultKey<$AttendanceLogsTable, List<AttendanceLog>>
  _attendanceLogsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.attendanceLogs,
    aliasName: 'session_windows__id__attendance_logs__session_window_id',
  );

  $$AttendanceLogsTableProcessedTableManager get attendanceLogsRefs {
    final manager = $$AttendanceLogsTableTableManager(
      $_db,
      $_db.attendanceLogs,
    ).filter((f) => f.sessionWindowId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_attendanceLogsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$SessionWindowsTableFilterComposer
    extends Composer<_$AppDatabase, $SessionWindowsTable> {
  $$SessionWindowsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get sessionLabel => $composableBuilder(
    column: $table.sessionLabel,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get startTime => $composableBuilder(
    column: $table.startTime,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get endTime => $composableBuilder(
    column: $table.endTime,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnFilters(column),
  );

  $$EventsTableFilterComposer get eventId {
    final $$EventsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.eventId,
      referencedTable: $db.events,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$EventsTableFilterComposer(
            $db: $db,
            $table: $db.events,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  Expression<bool> attendanceLogsRefs(
    Expression<bool> Function($$AttendanceLogsTableFilterComposer f) f,
  ) {
    final $$AttendanceLogsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.attendanceLogs,
      getReferencedColumn: (t) => t.sessionWindowId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$AttendanceLogsTableFilterComposer(
            $db: $db,
            $table: $db.attendanceLogs,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$SessionWindowsTableOrderingComposer
    extends Composer<_$AppDatabase, $SessionWindowsTable> {
  $$SessionWindowsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get sessionLabel => $composableBuilder(
    column: $table.sessionLabel,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get startTime => $composableBuilder(
    column: $table.startTime,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get endTime => $composableBuilder(
    column: $table.endTime,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get sortOrder => $composableBuilder(
    column: $table.sortOrder,
    builder: (column) => ColumnOrderings(column),
  );

  $$EventsTableOrderingComposer get eventId {
    final $$EventsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.eventId,
      referencedTable: $db.events,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$EventsTableOrderingComposer(
            $db: $db,
            $table: $db.events,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$SessionWindowsTableAnnotationComposer
    extends Composer<_$AppDatabase, $SessionWindowsTable> {
  $$SessionWindowsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get sessionLabel => $composableBuilder(
    column: $table.sessionLabel,
    builder: (column) => column,
  );

  GeneratedColumn<String> get startTime =>
      $composableBuilder(column: $table.startTime, builder: (column) => column);

  GeneratedColumn<String> get endTime =>
      $composableBuilder(column: $table.endTime, builder: (column) => column);

  GeneratedColumn<int> get sortOrder =>
      $composableBuilder(column: $table.sortOrder, builder: (column) => column);

  $$EventsTableAnnotationComposer get eventId {
    final $$EventsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.eventId,
      referencedTable: $db.events,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$EventsTableAnnotationComposer(
            $db: $db,
            $table: $db.events,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  Expression<T> attendanceLogsRefs<T extends Object>(
    Expression<T> Function($$AttendanceLogsTableAnnotationComposer a) f,
  ) {
    final $$AttendanceLogsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.attendanceLogs,
      getReferencedColumn: (t) => t.sessionWindowId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$AttendanceLogsTableAnnotationComposer(
            $db: $db,
            $table: $db.attendanceLogs,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$SessionWindowsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SessionWindowsTable,
          SessionWindow,
          $$SessionWindowsTableFilterComposer,
          $$SessionWindowsTableOrderingComposer,
          $$SessionWindowsTableAnnotationComposer,
          $$SessionWindowsTableCreateCompanionBuilder,
          $$SessionWindowsTableUpdateCompanionBuilder,
          (SessionWindow, $$SessionWindowsTableReferences),
          SessionWindow,
          PrefetchHooks Function({bool eventId, bool attendanceLogsRefs})
        > {
  $$SessionWindowsTableTableManager(
    _$AppDatabase db,
    $SessionWindowsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SessionWindowsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SessionWindowsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SessionWindowsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<int> eventId = const Value.absent(),
                Value<String> sessionLabel = const Value.absent(),
                Value<String> startTime = const Value.absent(),
                Value<String> endTime = const Value.absent(),
                Value<int> sortOrder = const Value.absent(),
              }) => SessionWindowsCompanion(
                id: id,
                eventId: eventId,
                sessionLabel: sessionLabel,
                startTime: startTime,
                endTime: endTime,
                sortOrder: sortOrder,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required int eventId,
                required String sessionLabel,
                required String startTime,
                required String endTime,
                required int sortOrder,
              }) => SessionWindowsCompanion.insert(
                id: id,
                eventId: eventId,
                sessionLabel: sessionLabel,
                startTime: startTime,
                endTime: endTime,
                sortOrder: sortOrder,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SessionWindowsTable, SessionWindow>(table),
                  $$SessionWindowsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback:
              ({eventId = false, attendanceLogsRefs = false}) {
                return PrefetchHooks(
                  db: db,
                  explicitlyWatchedTables: [
                    if (attendanceLogsRefs) db.attendanceLogs,
                  ],
                  addJoins:
                      <
                        T extends TableManagerState<
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic
                        >
                      >(state) {
                        if (eventId) {
                          state =
                              state.withJoin(
                                    currentTable: table,
                                    currentColumn: table.eventId,
                                    referencedTable:
                                        $$SessionWindowsTableReferences
                                            ._eventIdTable(db),
                                    referencedColumn:
                                        $$SessionWindowsTableReferences
                                            ._eventIdTable(db)
                                            .id,
                                  )
                                  as T;
                        }

                        return state;
                      },
                  getPrefetchedDataCallback: (items) async {
                    return [
                      if (attendanceLogsRefs)
                        await $_getPrefetchedData<
                          SessionWindow,
                          $SessionWindowsTable,
                          AttendanceLog
                        >(
                          currentTable: table,
                          referencedTable: $$SessionWindowsTableReferences
                              ._attendanceLogsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$SessionWindowsTableReferences(
                                db,
                                table,
                                p0,
                              ).attendanceLogsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.sessionWindowId == item.id,
                              ),
                          typedResults: items,
                        ),
                    ];
                  },
                );
              },
        ),
      );
}

typedef $$SessionWindowsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SessionWindowsTable,
      SessionWindow,
      $$SessionWindowsTableFilterComposer,
      $$SessionWindowsTableOrderingComposer,
      $$SessionWindowsTableAnnotationComposer,
      $$SessionWindowsTableCreateCompanionBuilder,
      $$SessionWindowsTableUpdateCompanionBuilder,
      (SessionWindow, $$SessionWindowsTableReferences),
      SessionWindow,
      PrefetchHooks Function({bool eventId, bool attendanceLogsRefs})
    >;
typedef $$AttendanceLogsTableCreateCompanionBuilder =
    AttendanceLogsCompanion Function({
      Value<int> id,
      required int eventId,
      required int studentId,
      required int sessionWindowId,
      required String direction,
      Value<PgDateTime> scannedAt,
      required int scannedBy,
      required String status,
      Value<String?> deviceNote,
      Value<PgDateTime> updatedAt,
    });
typedef $$AttendanceLogsTableUpdateCompanionBuilder =
    AttendanceLogsCompanion Function({
      Value<int> id,
      Value<int> eventId,
      Value<int> studentId,
      Value<int> sessionWindowId,
      Value<String> direction,
      Value<PgDateTime> scannedAt,
      Value<int> scannedBy,
      Value<String> status,
      Value<String?> deviceNote,
      Value<PgDateTime> updatedAt,
    });

final class $$AttendanceLogsTableReferences
    extends BaseReferences<_$AppDatabase, $AttendanceLogsTable, AttendanceLog> {
  $$AttendanceLogsTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static $EventsTable _eventIdTable(_$AppDatabase db) =>
      db.events.createAlias('attendance_logs__event_id__events__id');

  $$EventsTableProcessedTableManager get eventId {
    final $_column = $_itemColumn<int>('event_id')!;

    final manager = $$EventsTableTableManager(
      $_db,
      $_db.events,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_eventIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }

  static $StudentsTable _studentIdTable(_$AppDatabase db) =>
      db.students.createAlias('attendance_logs__student_id__students__id');

  $$StudentsTableProcessedTableManager get studentId {
    final $_column = $_itemColumn<int>('student_id')!;

    final manager = $$StudentsTableTableManager(
      $_db,
      $_db.students,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_studentIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }

  static $SessionWindowsTable _sessionWindowIdTable(_$AppDatabase db) => db
      .sessionWindows
      .createAlias('attendance_logs__session_window_id__session_windows__id');

  $$SessionWindowsTableProcessedTableManager get sessionWindowId {
    final $_column = $_itemColumn<int>('session_window_id')!;

    final manager = $$SessionWindowsTableTableManager(
      $_db,
      $_db.sessionWindows,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_sessionWindowIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }

  static $UsersTable _scannedByTable(_$AppDatabase db) =>
      db.users.createAlias('attendance_logs__scanned_by__users__id');

  $$UsersTableProcessedTableManager get scannedBy {
    final $_column = $_itemColumn<int>('scanned_by')!;

    final manager = $$UsersTableTableManager(
      $_db,
      $_db.users,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_scannedByTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$AttendanceLogsTableFilterComposer
    extends Composer<_$AppDatabase, $AttendanceLogsTable> {
  $$AttendanceLogsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get direction => $composableBuilder(
    column: $table.direction,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<PgDateTime> get scannedAt => $composableBuilder(
    column: $table.scannedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get deviceNote => $composableBuilder(
    column: $table.deviceNote,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<PgDateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  $$EventsTableFilterComposer get eventId {
    final $$EventsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.eventId,
      referencedTable: $db.events,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$EventsTableFilterComposer(
            $db: $db,
            $table: $db.events,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$StudentsTableFilterComposer get studentId {
    final $$StudentsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.studentId,
      referencedTable: $db.students,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$StudentsTableFilterComposer(
            $db: $db,
            $table: $db.students,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$SessionWindowsTableFilterComposer get sessionWindowId {
    final $$SessionWindowsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionWindowId,
      referencedTable: $db.sessionWindows,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionWindowsTableFilterComposer(
            $db: $db,
            $table: $db.sessionWindows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$UsersTableFilterComposer get scannedBy {
    final $$UsersTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.scannedBy,
      referencedTable: $db.users,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$UsersTableFilterComposer(
            $db: $db,
            $table: $db.users,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$AttendanceLogsTableOrderingComposer
    extends Composer<_$AppDatabase, $AttendanceLogsTable> {
  $$AttendanceLogsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get direction => $composableBuilder(
    column: $table.direction,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<PgDateTime> get scannedAt => $composableBuilder(
    column: $table.scannedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get deviceNote => $composableBuilder(
    column: $table.deviceNote,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<PgDateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );

  $$EventsTableOrderingComposer get eventId {
    final $$EventsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.eventId,
      referencedTable: $db.events,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$EventsTableOrderingComposer(
            $db: $db,
            $table: $db.events,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$StudentsTableOrderingComposer get studentId {
    final $$StudentsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.studentId,
      referencedTable: $db.students,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$StudentsTableOrderingComposer(
            $db: $db,
            $table: $db.students,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$SessionWindowsTableOrderingComposer get sessionWindowId {
    final $$SessionWindowsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionWindowId,
      referencedTable: $db.sessionWindows,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionWindowsTableOrderingComposer(
            $db: $db,
            $table: $db.sessionWindows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$UsersTableOrderingComposer get scannedBy {
    final $$UsersTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.scannedBy,
      referencedTable: $db.users,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$UsersTableOrderingComposer(
            $db: $db,
            $table: $db.users,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$AttendanceLogsTableAnnotationComposer
    extends Composer<_$AppDatabase, $AttendanceLogsTable> {
  $$AttendanceLogsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get direction =>
      $composableBuilder(column: $table.direction, builder: (column) => column);

  GeneratedColumn<PgDateTime> get scannedAt =>
      $composableBuilder(column: $table.scannedAt, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get deviceNote => $composableBuilder(
    column: $table.deviceNote,
    builder: (column) => column,
  );

  GeneratedColumn<PgDateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  $$EventsTableAnnotationComposer get eventId {
    final $$EventsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.eventId,
      referencedTable: $db.events,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$EventsTableAnnotationComposer(
            $db: $db,
            $table: $db.events,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$StudentsTableAnnotationComposer get studentId {
    final $$StudentsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.studentId,
      referencedTable: $db.students,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$StudentsTableAnnotationComposer(
            $db: $db,
            $table: $db.students,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$SessionWindowsTableAnnotationComposer get sessionWindowId {
    final $$SessionWindowsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sessionWindowId,
      referencedTable: $db.sessionWindows,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SessionWindowsTableAnnotationComposer(
            $db: $db,
            $table: $db.sessionWindows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$UsersTableAnnotationComposer get scannedBy {
    final $$UsersTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.scannedBy,
      referencedTable: $db.users,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$UsersTableAnnotationComposer(
            $db: $db,
            $table: $db.users,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$AttendanceLogsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $AttendanceLogsTable,
          AttendanceLog,
          $$AttendanceLogsTableFilterComposer,
          $$AttendanceLogsTableOrderingComposer,
          $$AttendanceLogsTableAnnotationComposer,
          $$AttendanceLogsTableCreateCompanionBuilder,
          $$AttendanceLogsTableUpdateCompanionBuilder,
          (AttendanceLog, $$AttendanceLogsTableReferences),
          AttendanceLog,
          PrefetchHooks Function({
            bool eventId,
            bool studentId,
            bool sessionWindowId,
            bool scannedBy,
          })
        > {
  $$AttendanceLogsTableTableManager(
    _$AppDatabase db,
    $AttendanceLogsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AttendanceLogsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AttendanceLogsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AttendanceLogsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<int> eventId = const Value.absent(),
                Value<int> studentId = const Value.absent(),
                Value<int> sessionWindowId = const Value.absent(),
                Value<String> direction = const Value.absent(),
                Value<PgDateTime> scannedAt = const Value.absent(),
                Value<int> scannedBy = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String?> deviceNote = const Value.absent(),
                Value<PgDateTime> updatedAt = const Value.absent(),
              }) => AttendanceLogsCompanion(
                id: id,
                eventId: eventId,
                studentId: studentId,
                sessionWindowId: sessionWindowId,
                direction: direction,
                scannedAt: scannedAt,
                scannedBy: scannedBy,
                status: status,
                deviceNote: deviceNote,
                updatedAt: updatedAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required int eventId,
                required int studentId,
                required int sessionWindowId,
                required String direction,
                Value<PgDateTime> scannedAt = const Value.absent(),
                required int scannedBy,
                required String status,
                Value<String?> deviceNote = const Value.absent(),
                Value<PgDateTime> updatedAt = const Value.absent(),
              }) => AttendanceLogsCompanion.insert(
                id: id,
                eventId: eventId,
                studentId: studentId,
                sessionWindowId: sessionWindowId,
                direction: direction,
                scannedAt: scannedAt,
                scannedBy: scannedBy,
                status: status,
                deviceNote: deviceNote,
                updatedAt: updatedAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$AttendanceLogsTable, AttendanceLog>(table),
                  $$AttendanceLogsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback:
              ({
                eventId = false,
                studentId = false,
                sessionWindowId = false,
                scannedBy = false,
              }) {
                return PrefetchHooks(
                  db: db,
                  explicitlyWatchedTables: [],
                  addJoins:
                      <
                        T extends TableManagerState<
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic,
                          dynamic
                        >
                      >(state) {
                        if (eventId) {
                          state =
                              state.withJoin(
                                    currentTable: table,
                                    currentColumn: table.eventId,
                                    referencedTable:
                                        $$AttendanceLogsTableReferences
                                            ._eventIdTable(db),
                                    referencedColumn:
                                        $$AttendanceLogsTableReferences
                                            ._eventIdTable(db)
                                            .id,
                                  )
                                  as T;
                        }
                        if (studentId) {
                          state =
                              state.withJoin(
                                    currentTable: table,
                                    currentColumn: table.studentId,
                                    referencedTable:
                                        $$AttendanceLogsTableReferences
                                            ._studentIdTable(db),
                                    referencedColumn:
                                        $$AttendanceLogsTableReferences
                                            ._studentIdTable(db)
                                            .id,
                                  )
                                  as T;
                        }
                        if (sessionWindowId) {
                          state =
                              state.withJoin(
                                    currentTable: table,
                                    currentColumn: table.sessionWindowId,
                                    referencedTable:
                                        $$AttendanceLogsTableReferences
                                            ._sessionWindowIdTable(db),
                                    referencedColumn:
                                        $$AttendanceLogsTableReferences
                                            ._sessionWindowIdTable(db)
                                            .id,
                                  )
                                  as T;
                        }
                        if (scannedBy) {
                          state =
                              state.withJoin(
                                    currentTable: table,
                                    currentColumn: table.scannedBy,
                                    referencedTable:
                                        $$AttendanceLogsTableReferences
                                            ._scannedByTable(db),
                                    referencedColumn:
                                        $$AttendanceLogsTableReferences
                                            ._scannedByTable(db)
                                            .id,
                                  )
                                  as T;
                        }

                        return state;
                      },
                  getPrefetchedDataCallback: (items) async {
                    return [];
                  },
                );
              },
        ),
      );
}

typedef $$AttendanceLogsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $AttendanceLogsTable,
      AttendanceLog,
      $$AttendanceLogsTableFilterComposer,
      $$AttendanceLogsTableOrderingComposer,
      $$AttendanceLogsTableAnnotationComposer,
      $$AttendanceLogsTableCreateCompanionBuilder,
      $$AttendanceLogsTableUpdateCompanionBuilder,
      (AttendanceLog, $$AttendanceLogsTableReferences),
      AttendanceLog,
      PrefetchHooks Function({
        bool eventId,
        bool studentId,
        bool sessionWindowId,
        bool scannedBy,
      })
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$UsersTableTableManager get users =>
      $$UsersTableTableManager(_db, _db.users);
  $$StudentsTableTableManager get students =>
      $$StudentsTableTableManager(_db, _db.students);
  $$EventsTableTableManager get events =>
      $$EventsTableTableManager(_db, _db.events);
  $$SessionWindowsTableTableManager get sessionWindows =>
      $$SessionWindowsTableTableManager(_db, _db.sessionWindows);
  $$AttendanceLogsTableTableManager get attendanceLogs =>
      $$AttendanceLogsTableTableManager(_db, _db.attendanceLogs);
}
